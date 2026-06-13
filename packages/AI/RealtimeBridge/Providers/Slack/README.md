# @memberjunction/ai-bridge-slack

The **Slack huddle** Realtime Bridge driver in MemberJunction's Realtime Bridges program. It connects
the one realtime agent engine to a **Slack huddle**: bidirectional audio (and directional video + screen,
since modern huddles do full AV), a diarized participant roster, participant mute, huddle/thread chat, and
a **Meeting Controls** facilitator channel — all behind an injectable Slack huddle SDK seam so the driver
builds and unit-tests with **no network and no real Slack / Chime SDK**. It is a structural mirror of the
reference [`@memberjunction/ai-bridge-zoom`](../BridgeZoom/README.md) driver.

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§3 provider abstraction, §4b channels, §8 Slack capability row) for the full architecture.

## 🚨 REAL-API RISK — the huddle MEDIA API is the gating unknown 🚨

**This is the one Realtime Bridge driver with a genuine API-availability risk, not merely a binding TODO.**

Unlike Zoom and Teams — where binding the real SDK is a known, documented deployment step — Slack does
**not** publicly document a supported **bot-join-with-media** path for huddles. There is no published way
for an app/bot to join a huddle as a *media* participant and pull per-participant PCM audio / push
synthesized audio back. Because huddles run on **Amazon Chime** under the hood, production media access
may require a **Chime-level integration** (a Chime SDK media pipeline / app instance) and/or an
entitlement Slack does not expose through its standard developer surface.

What this means:

- **On firm public-API ground (signaling + chat):** huddle membership/roster, huddle start/end events,
  `chat.postMessage`, and participant mute. The driver's roster, chat, and Meeting-Controls perception
  for these work against documented Slack Web API + Events/Socket Mode surfaces.
- **At risk (media):** audio in/out and diarized speaking — these depend on the unverified huddle media
  path.

The driver and its `ISlackHuddleSdk` seam are deliberately built **as if** the media path exists, so the
moment huddle media access is verified/obtained, binding it is a thin adapter with no driver changes.
**But the provider must stay `Disabled` until someone confirms a supported bot-join-with-media path (or
stands up the Chime-level pipeline).** The risk is flagged in three places in code: the `ISlackHuddleSdk`
seam header (`slack-sdk.ts`), the `SlackBridge` class doc (`slack-bridge.ts`), and a `// REAL-API RISK:`
comment on the default (unbound) SDK factory whose thrown error names the huddle-media requirement.

## Install

```bash
npm install @memberjunction/ai-bridge-slack
```

## What it provides

- **`SlackBridge`** — `@RegisterClass(BaseRealtimeBridge, 'SlackBridge')`. The `MJ: AI Bridge Providers`
  row with `DriverClass = 'SlackBridge'` resolves to this driver via the `ClassFactory`. Implements the
  four `BaseRealtimeBridge` abstracts (`Connect` / `Disconnect` / `SendMedia` / `OnMedia`) and the
  capability-gated virtuals Slack supports (`GetParticipants`, `OnParticipantChange`), plus
  `GetMeetingControlsEventSource` for the facilitator channel and a `PostChatMessage` helper.
- **`ISlackHuddleSdk`** — the **injectable seam** the driver depends on instead of the real SDK, named
  after Slack huddle concepts. **See the REAL-API RISK above — its media operations are the gating unknown.**
- **`SlackMeetingControlsEventSource`** — adapts the seam's roster / hand-raise / speaking / mute into
  the bridge's `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the Slack seed row)

| Capability | Status |
|---|---|
| On-demand + scheduled + **invite** join | ✅ (invite ⚠️ per the seed) |
| Inbound routing | ⚠️ advertised; subject to the same huddle-access caveats |
| Audio in / out | ✅ at the seam — ⚠️ **depends on the gating-unknown huddle media path** |
| Video in/out, Screen in/out (directional flags) | ✅ (transport carries them; models light audio first — ⚠️ media path) |
| Speaker diarization (roster + per-speaker labels) | ✅ at the seam — ⚠️ per-speaker audio depends on the huddle media path |
| Participant mute (Meeting Controls) | ✅ |
| Huddle / thread chat | ✅ |
| Native raised-hand | ⚠️ Partial — wired where Slack surfaces it to apps; tolerant of it never firing |
| DTMF / call transfer / recording | ➖ not Slack-huddle features here — the gated base methods throw `BridgeCapabilityNotSupportedError` |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the driver re-asserts each flag with `RequireFeature` at the top of its overrides.

### Slack vs. Zoom capability differences

Slack advertises everything Zoom does, **plus** `InviteJoin` and `InboundRouting` (⚠️ in the seed). It
does **not** advertise `NativeInvite` (unlike Teams). The decisive difference, however, is not a
capability flag but the **media-API availability risk** above: Zoom's media binding is a documented
deployment TODO, whereas Slack's huddle media binding is genuinely unverified.

## The Slack huddle SDK seam (`ISlackHuddleSdk`)

The driver never imports the real Slack / Chime SDK. It depends only on this minimal interface, named
after Slack huddle concepts (huddles do full audio + video + screen and run on Amazon Chime under the hood):

```typescript
export interface ISlackHuddleSdk {
    join(args: SlackJoinArgs): Promise<SlackJoinResult>;
    leave(): Promise<void>;
    sendAudioFrame(pcm: ArrayBuffer): void;                                 // ⚠️ agent's voice out — huddle media path (Chime)
    onAudioFrame(cb: (frame: SlackAudioFrame) => void): void;               // ⚠️ raw per-participant audio in — huddle media path
    onParticipantJoin(cb: (p: SlackParticipant) => void): void;
    onParticipantLeave(cb: (id: string) => void): void;
    onHandRaise(cb: (id: string, raised: boolean) => void): void;           // ⚠️ partial on Slack
    getParticipants(): Promise<SlackParticipant[]>;
    postChatMessage(text: string): Promise<void>;                           // huddle / thread chat
    muteParticipant(participantId: string): Promise<void>;
    onMeetingEnded(cb: () => void): void;
}
```

### Production binding (deployment — gated on the REAL-API RISK above)

In production this is bound to a thin adapter over the **Slack Web API + Events/Socket Mode** (membership,
roster events, chat, mute) **plus** a **verified huddle media path** (likely an **Amazon Chime**-level
integration) for per-participant PCM audio in/out. Supply a factory via the creation seam:

```typescript
import { SlackBridge } from '@memberjunction/ai-bridge-slack';

// Once, where bridge drivers are configured:
//   bridge.SetSdkFactory((config) => new RealSlackHuddleSdkAdapter(config));
// The adapter implements ISlackHuddleSdk over the real Slack SDK + a verified huddle media path.
// The driver + its tests do not change.
```

Out of the box, `SlackBridge` ships **without** the real SDK adapter — `Connect` throws an explicit
"bind the real Slack huddle SDK … plus a verified huddle MEDIA path" error until `SetSdkFactory` is
called. Tests inject a `FakeSlackHuddleSdk`. **Do not promote the provider from `Disabled` until the
huddle media path is verified/obtained** (see the REAL-API RISK section).

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, wires the transport seam to the injected
`IRealtimeSession`, and (when a channel host is supplied) wires the Meeting Controls channel from
`GetMeetingControlsEventSource`. See the bridge-server package and the guide's "Channel plane" section.

## Testing

`FakeSlackHuddleSdk` (in `src/__tests__/`) is an in-memory `ISlackHuddleSdk` with drive helpers and
capture sinks — it stands in for the gating-unknown huddle media path so the driver can be fully
exercised today, ahead of any verified production media binding. The suite covers connect/disconnect
(incl. parsing the channel id out of the huddle link and the explicit huddle-media error when no SDK is
bound), audio in→`OnMedia` (speaker labels) and out→seam, participant join/leave → roster + event source,
native hand-raise → Meeting Controls perception, capability gating (a feature Slack lacks throws; the
Slack feature set propagates), and chat — all with no network.

```bash
cd packages/AI/Providers/BridgeSlack && npm run test
```
