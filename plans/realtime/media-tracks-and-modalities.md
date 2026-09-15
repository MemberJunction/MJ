# Realtime media tracks and an open modality vocabulary

**Status:** proposal for discussion — no code
**Scope:** cross-provider realtime architecture. Prompted by Gemini 3.8 Live's video input, but
deliberately not about Gemini.
**Related:** [`gemini-3-8-live.md`](gemini-3-8-live.md) §5.5 / §5.6, [`gpt-live-1.md`](gpt-live-1.md)

---

## 1. What we actually have today (verified, not remembered)

The realtime co-agent architecture was designed to be multi-channel, and it is — but a channel
is **not** a media pipe, and this is worth stating plainly because the name invites the wrong
conclusion.

`BaseRealtimeChannelServer`'s entire public surface is:

```
GetServerToolDefinitions(): RealtimeToolDefinition[]
ExecuteServerTool(toolName, argsJson): ServerChannelToolResult
Initialize / OnSessionStarted / OnChannelStateSave / OnSessionClosed / Dispose
```

No frames. No samples. No tracks. A channel is **a tool surface with session-scoped persisted
state and a lifecycle**, resolved from the `MJ: AI Agent Channels` registry as a
`ServerPluginClass` / `ClientPluginClass` pair. Five exist: Media, Whiteboard, Remote Browser,
Meeting Controls, Client Context.

Even the one called **Media** is not a media stream: it is *the agent showing images / video /
PDFs to the user*, executed client-side through `Media_ShowMedia` / `Media_PlayMedia` /
`Media_Highlight` tools, with the server half guarding the persisted state blob. It is a
**rendering surface driven by tool calls**, in the outbound-to-human direction.

So the honest summary: **channels are parallel and stateful, but they carry semantics via tools,
not media via streams.** The only true media plane in MJ today is audio in / audio out, and it is
implicit — hardcoded into each driver, with no abstraction naming it.

That is why Gemini's video input has nowhere to land, and why an avatar video output would have
nowhere to land either.

---

## 2. The three planes

Separating these is the whole proposal. MJ already models two of them and leaves one implicit:

| Plane | What it carries | Shape | Status in MJ |
|---|---|---|---|
| **Media** | continuous, time-sequenced samples bound to a model session | streams | **implicit** — audio only, hardcoded per driver |
| **Semantic** | discrete request/response against a surface | tool calls + state | modelled: channels |
| **Reasoning** | who thinks, and how hard | config | modelled: `RealtimeReasoningPlane` |

The proposal introduces the media plane as a first-class **track**, and then makes tracks and
channels *compose* rather than compete.

---

## 3. Tracks

A **track** is one directional stream of one modality on a model session.

```ts
/** Direction is a PROPERTY, not a type — audio is both, and video is becoming both. */
export type RealtimeTrackDirection = 'inbound' | 'outbound';

export interface RealtimeTrackDescriptor {
    /** Registered modality key. See §4 — deliberately a string, not a closed union. */
    Modality: string;
    Direction: RealtimeTrackDirection;
    /** Wire encoding, negotiated: 'audio/pcm;rate=16000', 'image/jpeg', 'video/vp8'. */
    Encoding?: string;
    /** Sample/frame cadence where meaningful (fps, Hz). */
    Rate?: number;
    /** How this track is billed, so cost is a property and not a surprise. */
    UsageBasis?: readonly ('tokens' | 'seconds' | 'frames' | 'bytes')[];
    /** Whether establishing it requires an explicit human grant (camera, screen, mic). */
    RequiresConsent?: boolean;
}
```

Four properties earn their place:

**Direction as a property.** Separate `InboundVideo` / `OutboundVideo` types would double every
future modality and get the abstraction wrong: audio is already bidirectional and video is becoming
so.

**Negotiation, not declaration.** The model declares what it supports; the session *requests*; the
profile establishes the intersection and reports what actually exists. This is what makes "video off
by default" structural rather than a default value someone can forget — **an unrequested track is
not established.** Gemini's own default is video ON, so any design where omission means "inherit
the provider" ships a billed surprise.

**Consent as a track property.** Camera and screen capture need a human grant; audio out does not.
Making it a property means the UI prompts generically instead of special-casing each modality, and
the audit trail is uniform.

**Cost as a track property.** `UsageBasis` extends the existing
`RealtimeSessionCapabilities.UsageBases` pattern, which already had to be a *list* rather than an
enum because GPT-Live bills seconds and tokens from different places. Frames and bytes are the same
kind of addition.

**Lifecycle is per-track, not per-session.** `AddTrack` / `RemoveTrack` mid-conversation is the
normal case — "share your screen for a second" — so tracks mirror WebRTC's proven model rather
than inventing one.

---

## 4. An OPEN modality vocabulary — the part that has to be right

If modality is `type Modality = 'audio' | 'video'`, then every new modality is a Core release, a
published package version, and a coordinated upgrade. That is exactly the tax we are trying to
avoid.

So: **modality is a registered key with a descriptor**, resolved the same way channels already are
— a metadata row plus optional plugin classes. A new modality becomes a row, not a release.

With one deliberate exception. MJ has to *reason* about some modalities — cost, consent, whether
the transcript means anything — so there is a small set of **well-known keys** Core knows by name
(`audio`, `video`, `image`, `text`), and everything else is opaque-but-transportable. This is the
same shape as `RealtimeTurnDetectionMode`'s `'native'`: a closed core with a deliberate open door.

Plausible near-future modalities, to check the design rather than to build:

| Modality | Direction | Why it is coming |
|---|---|---|
| `video` | in | Gemini 3.8 Live, today |
| `video` | **out** | avatars; generated scene; annotation overlay |
| `pose` / `hand` | in | AR/VR headsets, accessibility, sign language |
| `telemetry` | in | robotics — Google already ships "Robotics with streaming" |
| `music` | out | realtime music models (Lyria Real Time) — audio bytes, but different semantics, different licensing, different metering |
| `biosignal` | in | affect from heart rate; health contexts, heavy consent |
| `haptic` | out | devices, accessibility |
| `depth` | in | spatial understanding |

Note `music`: it is *audio bytes* and would be wrong to model as the `audio` track, because the
semantics (no turn-taking, no transcript, different rights) diverge. That is the argument for
modality being a registry key rather than a guess at the encoding.

---

## 5. How tracks and channels compose — the actual insight

They are not competitors. **A track is the transport of samples; a channel is a surface that can
source or sink one.**

```ts
/** Optional additions to the channel contract — a channel MAY participate in the media plane. */
SourcesTracks?: readonly RealtimeTrackDescriptor[];   // surface -> model
SinksTracks?: readonly RealtimeTrackDescriptor[];     // model  -> surface
```

That single seam explains every case, present and future:

| Case | Channel | Track |
|---|---|---|
| Whiteboard | yes — tools + state | none. Pure semantic, correct as built |
| Screen share | yes — owns picker, consent UI, state | **sources** inbound `video` |
| Camera | yes — device selection, consent, preview | **sources** inbound `video` |
| Avatar | yes — owns the render surface | **sinks** outbound `video` |
| Remote browser | yes — tools today | **could** source inbound `video` instead of screenshots-as-tool-results — a real upgrade path, not a rewrite |
| Media display | yes, as built | none today; could sink outbound `video` |
| Audio | no channel — the session's own plane | inbound + outbound `audio` |

The remote-browser row is the one that convinces me the seam is in the right place. Today the agent
sees the browser by calling a tool that returns a screenshot — discrete, polled, latency-bound. With
an inbound video track the *model* watches the page continuously while the agent still *acts*
through tools. Same channel, same tools, new track. Nothing is thrown away, and a capability we
could not previously express becomes available on models that support it.

---

## 6. Per-model parameters: generalize, then map (supersedes `gemini-3-8-live.md` §5.6)

§5.6 offered a provider-private passthrough as one option. **Withdraw that as the primary answer.**
The rule should be the one MJ already follows for turn detection:

1. **A normalized, provider-neutral setting** in `ModelConfiguration.Realtime`, named for what it
   means rather than for any vendor's field.
2. **Per-profile mapping** to the vendor wire field, shipped once per provider.
3. **Graceful degradation** — a profile with no mapping logs and ignores it; a wrong inherited value
   must never reject a session.

`buildTurnDetection` is the worked example and `RealtimeTurnDetectionMode` is the worked vocabulary.
`TurnCoverage` from the capability-contract commit already follows it, and Gemini would be the only
profile mapping it today — which is exactly the shape asked for.

A passthrough bag survives only as a **documented escape hatch for genuinely provider-private
knobs**, allow-listed per model, and explicitly *not* the path for anything MJ reasons about (cost,
consent, behaviour). The persona plan already recorded why an untyped bag relocates a vendor leak
instead of fixing it.

**Open design question worth settling before code:** with tracks, is `TurnCoverage` still its own
setting? "Is there an inbound video track" and "are established video frames included in this turn's
context" are separable — a track can exist while a given turn ignores it — but they are close enough
that shipping both without deciding invites two knobs that disagree. My read: keep them separate,
because coverage is a *per-turn context* decision and the track is a *session transport* decision,
and conflating them would mean tearing down a negotiated track to stop including frames.

---

## 7. What this is not

- Not a rewrite of channels. Channels are correct as built; they gain two optional properties.
- Not WebRTC-in-Core. Tracks are a contract; transport stays per-driver.
- Not required by the Gemini 3.8 PR. That PR needs audio only. Video input is the first *consumer*
  of this design and a strong candidate for its own PR.
- Not a migration. `MJ: AI Agent Channels` already has the registry shape a modality registry needs.

## 8. Sequencing

1. This document, agreed.
2. Track contract in `AI/Core` — types only, nobody reads them (the shape the capability contract
   commit already used).
3. Audio retrofitted as two declared tracks, changing no behaviour. **This is the honesty test:** if
   describing today's audio as tracks is awkward, the abstraction is wrong and better to learn it
   here.
4. Modality registry, seeded with the well-known keys.
5. First new track: inbound `video` on Gemini, sourced by a screen-share/camera channel.
6. First outbound non-audio track when an avatar provider lands.
