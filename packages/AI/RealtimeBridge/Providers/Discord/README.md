# @memberjunction/ai-bridge-discord

The **Discord** Realtime Bridge driver in MemberJunction's Realtime Bridges program. It connects the one
realtime agent engine to a **Discord VOICE CHANNEL**: bidirectional per-user audio, a diarized member
roster, member mute, text-channel chat, and a **Meeting Controls** facilitator channel — all behind an
injectable Discord voice / bot-gateway seam so the driver builds and unit-tests with **no network and no
real Discord client**.

> ### Discord is voice-CHANNEL based, not meeting based
> Unlike Zoom/Teams/Meet, Discord has no scheduled-meeting + invite-link concept. A bot **joins a
> persistent voice channel** (a guild + channel id) on demand and streams Opus/PCM audio over UDP. So this
> driver advertises **on-demand join + inbound routing only** — no scheduled-join, no invite-join, no
> native-invite. What Discord offers first-class: **per-user audio** (great diarization), **video / screen
> ("Go Live")**, and a **text channel** for chat. The production binding is `@discordjs/voice` +
> `discord.js`; out of the box, `Connect` throws an explicit "bind the real Discord voice SDK" error until
> `SetSdkFactory` is called.

See the [Realtime Bridges Guide](../../../../guides/REALTIME_BRIDGES_GUIDE.md) and
[`/plans/realtime/realtime-bridges-architecture.md`](../../../../plans/realtime/realtime-bridges-architecture.md)
(§3 provider abstraction, §4b channels, §8 Discord capability row) for the full architecture. The
[`@memberjunction/ai-bridge-zoom`](../BridgeZoom/README.md) and
[`@memberjunction/ai-bridge-googlemeet`](../BridgeGoogleMeet/README.md) drivers are the references this one
mirrors (Discord = Zoom's chat + Meet's absent hand-raise).

## Install

```bash
npm install @memberjunction/ai-bridge-discord
```

## What it provides

- **`DiscordBridge`** — `@RegisterClass(BaseRealtimeBridge, 'DiscordBridge')`. The
  `MJ: AI Bridge Providers` row with `DriverClass = 'DiscordBridge'` resolves to this driver via the
  `ClassFactory`. Implements the four `BaseRealtimeBridge` abstracts (`Connect` / `Disconnect` /
  `SendMedia` / `OnMedia`) and the capability-gated virtuals Discord supports (`GetParticipants`,
  `OnParticipantChange`), plus `GetMeetingControlsEventSource` for the facilitator channel and
  `PostChatMessage` for the text channel.
- **`IDiscordVoiceSdk`** — the **injectable seam** the driver depends on instead of the real Discord client.
- **`DiscordMeetingControlsEventSource`** — adapts the seam's roster / speaking / mute into the bridge's
  `IBridgeMeetingControlsEventSource`, so the engine wires the Meeting Controls channel.

## Capability coverage (the Discord seed row)

| Capability | Status |
|---|---|
| On-demand join | ✅ |
| **Scheduled / invite / native-invite join** | ➖ **not Discord concepts** — voice-channel based, on-demand only |
| Inbound routing | ✅ |
| Audio in / out (per-user) | ✅ (excellent diarization — Discord keys received audio by the speaking user id) |
| Video in/out, Screen in/out ("Go Live", directional flags) | ✅ (transport carries them; models light audio first) |
| Speaker diarization (roster + per-user labels) | ✅ |
| Member mute (Meeting Controls) | ✅ (bot needs the "Mute Members" permission) |
| In-channel (text) chat | ✅ `PostChatMessage` — Discord text channels are programmatically postable (unlike Meet) |
| **Hand-raise** | ➖ **not offered** — Discord voice channels surface no hand-raise signal (see below) |
| DTMF / call transfer / recording | ➖ not Discord features — the gated base methods throw `BridgeCapabilityNotSupportedError` |

Capability gating is two-layer (defense-in-depth): the engine checks the provider's `SupportedFeatures`
first, and the driver re-asserts each flag with `RequireFeature` at the top of its overrides.

### How Discord's missing features (hand-raise, scheduled/invite) are handled

**Hand-raise (➖).** Like Google Meet, Discord voice channels expose **no participant hand-raise/lower
signal**. So, unlike `ZoomBridge`:

- **`IDiscordVoiceSdk` has no `onHandRaise` operation** — there is nothing to subscribe to.
- **`DiscordBridge` wires no hand-raise subscription** in `Connect`.
- **`DiscordMeetingControlsEventSource` has no `IngestHandRaise`** — the driver feeds nothing.
- The channel contract (`IBridgeMeetingControlsEventSource`) still **requires** an `OnHandRaiseChange`
  registration, so the source implements it — but for Discord it is a **registered-but-never-fired no-op**.
  The hand-raise *queue* facet of the facilitator is therefore inert on Discord; roster, speaking, and mute
  remain fully functional. (Because Discord *does* have a text channel, the Hybrid "raise hand via chat"
  turn-taking mode still works via `PostChatMessage` — that is a chat-post path, not a native hand-raise.)

**Scheduled / invite / native-invite (➖).** These are not Discord concepts. The Discord seed row omits
those `SupportedFeatures` flags, so the engine never asks for them and the driver carries no such surface —
the only join op on the seam is `joinVoiceChannel(guild, channel)`.

Dedicated tests (`hand-raise & scheduled/invite correctly absent`) pin this down: they assert the seam
exposes no `onHandRaise` op (and that driving every signal Discord *does* surface — roster churn, speaking,
mute, chat — never synthesizes a hand-raise event), and that the seam carries only channel-based join (no
scheduled/invite/native-invite operations).

## The Discord voice seam (`IDiscordVoiceSdk`)

The driver never imports the real Discord client. It depends only on this minimal interface (note: **no
`onHandRaise`** vs. the Zoom seam, but it **keeps `postChatMessage`** — unlike the Meet seam):

```typescript
export interface IDiscordVoiceSdk {
    joinVoiceChannel(args: DiscordJoinArgs): Promise<DiscordJoinResult>; // guild + voice-channel id
    leaveVoiceChannel(): Promise<void>;
    sendAudioFrame(pcm: ArrayBuffer): void;                              // agent's voice out (audio player)
    onAudioFrame(cb: (frame: DiscordAudioFrame) => void): void;         // raw per-USER audio in (diarization)
    onMemberJoin(cb: (m: DiscordMember) => void): void;
    onMemberLeave(cb: (id: string) => void): void;
    getMembers(): Promise<DiscordMember[]>;
    postChatMessage(text: string): Promise<void>;                       // Discord text channel
    muteMember(userId: string): Promise<void>;                          // bot needs "Mute Members"
    onDisconnect(cb: () => void): void;
}
```

### Production binding (deployment TODO)

In production this is bound to **`@discordjs/voice`** (voice connection + Opus audio receiver/player) plus
**`discord.js`** (gateway client for member presence + text-channel posts) for per-user Opus/PCM audio.
Supply a factory via the creation seam:

```typescript
import { DiscordBridge } from '@memberjunction/ai-bridge-discord';

// Once, where bridge drivers are configured:
//   bridge.SetSdkFactory((config) => new RealDiscordVoiceSdkAdapter(config));
// The adapter implements IDiscordVoiceSdk over @discordjs/voice + discord.js. The driver + its tests do not change.
```

Out of the box, `DiscordBridge` ships **without** the real adapter — `Connect` throws an explicit "bind the
real Discord voice SDK" error until `SetSdkFactory` is called. Tests inject a `FakeDiscordVoiceSdk`.

## Usage (engine-driven)

The bridge is not used directly — `AIBridgeEngine.StartBridgeSession` (`@memberjunction/ai-bridge-server`)
resolves it from the provider's `DriverClass`, wires the transport seam to the injected `IRealtimeSession`,
and (when a channel host is supplied) wires the Meeting Controls channel from
`GetMeetingControlsEventSource`. See the bridge-server package and the guide's "Channel plane" section.

## Testing

`FakeDiscordVoiceSdk` (in `src/__tests__/`) is an in-memory `IDiscordVoiceSdk` with drive helpers and
capture sinks. The suite covers connect/disconnect (incl. channel-URL / guild-channel-pair / bare-channel
address parsing), audio in→`OnMedia` (speaker labels) and out→seam, member join/leave → roster + event
source, **chat posting**, **the correctly-absent hand-raise + scheduled/invite paths**, capability gating
(a feature Discord lacks throws), and mute — all with no network.

```bash
cd packages/AI/Providers/BridgeDiscord && npm run test
```
