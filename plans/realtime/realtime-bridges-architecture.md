# Realtime Bridges — Unified Architecture & Implementation Plan

**Status:** Plan for review (2026-06-13). Branch `realtime-meeting-bridge`. Companion to
[REALTIME_CO_AGENTS_GUIDE](../../guides/REALTIME_CO_AGENTS_GUIDE.md),
[multi-party-and-meeting-bridge.md](multi-party-and-meeting-bridge.md), and
[ai-agent-sessions.md](../ai-agent-sessions.md).

> **The one-line thesis:** there is exactly **one** realtime agent engine. A *bridge* is a
> pluggable **media transport + channel contributor** that connects that engine to an external
> endpoint — a Zoom/Teams/Slack/Meet/Webex **meeting**, or a Twilio/VOIP **phone call**. It carries
> bidirectional **media (audio, video, screen — full duplex)** AND contributes a dynamic **tool +
> signaling vocabulary** (the platform's native surfaces: hand-raise, roster, whiteboard, …) as
> first-class MJ **channels**. We are not building a second realtime stack; we are completing the
> engine's media-transport seam and routing each bridge's surfaces through the existing channel plane.

> **Nothing in this architecture is audio-specific.** Audio is the first media track we light up
> because the models are there today, but the transport seam carries **typed media tracks** (audio /
> video / screen, each inbound *and* outbound). When realtime models gain full-duplex high-res video
> — soon — the same bridges already carry the video tracks with zero re-architecture. "Audio bridge"
> is shorthand for "the audio track of a media bridge," never a constraint.

---

## 1. Why this is one engine, not two

The realtime agent already abstracts everything that makes an agent *converse*: speech-to-speech
model drivers (OpenAI Realtime, Gemini Live, …), the co-agent resolution chain, tools via
`RealtimeToolBroker`, progress narration, interactive channels (the whiteboard), transcript relay,
and the `AIAgentSession` lifecycle/persistence. **None of that cares where the audio comes from.**

The realtime session contract `IRealtimeSession` is already media-agnostic — its `SendInput()`
takes raw media frames and `OnOutput()` emits them (the guide notes both for video and audio). What
has been **deferred three times** in the realtime work is the *server-bridged media transport*:
the guide states verbatim that "`IRealtimeSession.SendInput` / `OnOutput` have no client-facing
pipe" and tags the gap "the unified-transport track."

**A bridge IS that pipe.** This plan completes the server-bridged transport seam once, generically,
and then a bridge is just a driver that fills it from an external audio source. Meetings and
telephony are two families of the same abstraction.

```mermaid
graph LR
    subgraph Engine["ONE Realtime Engine (reused 100%)"]
        RS["IRealtimeSession<br/>(speech model + tools + narration)"]
        RUN["RealtimeSessionRunner<br/>(co-agent, channels, transcript)"]
        SESS["AIAgentSession<br/>(persistence / lifecycle)"]
        RUN --- RS
        RUN --- SESS
    end

    subgraph Transports["Pluggable Media Transports (the seam)"]
        BROWSER["Browser / WebRTC<br/>(client-direct — today)"]
        MEET["Meeting Bridge<br/>(Zoom/Teams/Slack/Meet/Webex/Discord)"]
        TEL["Telephony Bridge<br/>(Twilio/Vonage/RingCentral/VOIP)"]
    end

    BROWSER <-->|"SendInput / OnOutput"| RS
    MEET <-->|"SendInput / OnOutput"| RS
    TEL <-->|"SendInput / OnOutput"| RS

    style Engine fill:#1f3a5f,stroke:#2d8659,color:#fff
    style Transports fill:#5a3d7a,stroke:#7c5295,color:#fff
```

### The honest nuance: server engine vs. client console

The realtime work has **two** halves, and they reuse differently:

| Layer | Reuse for bridges | Why |
|---|---|---|
| **Server engine** — runner, co-agent resolution, tools, narration, channels, transcript relay, `AIAgentSession` persistence | **100%, zero new logic** | The brain/voice/memory of the agent are transport-agnostic. A bridge swaps only the audio plane. |
| **Client console** — progressive-disclosure overlay, orb, captions, composer, whiteboard *surface* | **Reused as an OPTIONAL observer/monitor surface, not the primary interface** | A bot in a Zoom meeting has **no human at an MJ browser tab** — the meeting (or the phone) *is* the interface. But a human *can* open MJ to watch a bridged session live (transcript, the whiteboard the agent is drawing, participants). The same console components power that read-only monitor. |

So when you asked "most of that is a server engine, right? plug it right in with zero effort?" — **for the server engine, yes, that is the literal design goal and the seam already exists in contract form.** The client console doesn't auto-apply (no browser participant in a phone call), but it isn't wasted: it becomes the bridged-session **monitor**. No second variant of anything.

---

## 2. Architecture — the layer cake

```mermaid
graph TD
    subgraph Meta["Metadata (CodeGen entities, seeded via mj-sync)"]
        P["AIBridgeProvider<br/>registry + capability flags"]
        ID["AIBridgeAgentIdentity<br/>agent's address / phone#"]
        SB["AIAgentSessionBridge<br/>session ↔ transport binding"]
        PART["AIAgentSessionBridgeParticipant<br/>who's on the call"]
    end

    subgraph Base["Cross-platform base (no execution)"]
        EB["AIBridgeEngineBase<br/>(BaseEngine) — caches providers,<br/>capabilities, agent identities"]
        BBP["BaseRealtimeBridge (abstract)<br/>lifecycle + capability methods,<br/>NotImplemented by default"]
        TT["TurnTakingPolicy<br/>passive / active / hybrid<br/>(platform-agnostic)"]
    end

    subgraph Server["Server coordination & execution"]
        ENG["AIBridgeEngine<br/>(extends base) — bot lifecycle,<br/>host affinity, janitor, calendar watchers,<br/>inbound routing"]
        RUN["RealtimeSessionRunner<br/>(EXISTING realtime engine)"]
    end

    subgraph Drivers["Bridge drivers (minimal subclasses) — all in scope to build"]
        ZOOM["ZoomBridge"]
        TEAMS["TeamsBridge"]
        SLACK["SlackBridge"]
        MEET["GoogleMeetBridge"]
        WEBEX["WebexBridge"]
        DISCORD["DiscordBridge"]
        RING["RingCentralBridge<br/>(UCaaS: meeting + tel.)"]
        TWILIO["TwilioBridge (telephony)"]
        VONAGE["VonageBridge (telephony)"]
    end

    Meta --> EB
    EB --> ENG
    BBP --> ENG
    TT --> ENG
    ENG <-->|"audio frames"| RUN
    BBP -.implemented by.-> ZOOM & TEAMS & SLACK & MEET & WEBEX & DISCORD & RING & TWILIO & VONAGE
    ENG -->|"ClassFactory.CreateInstance(BaseRealtimeBridge, DriverClass)"| Drivers

    style Meta fill:#2d5016,stroke:#1a5c3a,color:#fff
    style Base fill:#1f3a5f,stroke:#264f7a,color:#fff
    style Server fill:#5a3d7a,stroke:#7c5295,color:#fff
    style Drivers fill:#7a4a1f,stroke:#a0632a,color:#fff
```

**The engine pair mirrors `AIEngineBase` / `AIEngine` exactly** (your explicit ask):

- **`AIBridgeEngineBase`** (`@memberjunction/ai-bridge-base`, proposed) — `BaseEngine`
  subclass. Caches `AIBridgeProvider` rows + their capability flags + `AIBridgeAgentIdentity`
  rows. Pure metadata: provider resolution (by name, by join-URL pattern, by inbound number),
  capability lookups, identity resolution. **No execution.** Reactive via `BaseEngine` events.
- **`AIBridgeEngine`** (`@memberjunction/ai-bridge-server`, proposed) — extends the base,
  adds **all coordination + execution**: spinning up bot connections, the per-node host registry
  (`HostInstanceID` affinity — copied from `AIAgentSession`), the janitor (reconcile orphaned bot
  sessions), calendar/invite watchers, inbound-call routing, and wiring each bridge's audio to/from
  the existing `RealtimeSessionRunner`.

---

## 3. The provider abstraction — 100% generic, capability-gated

`BaseRealtimeBridge` is the abstract driver. Two principles, both per your spec:

1. **Maximal base class.** Everything that can be done generically lives in the base (or the engine
   calling the base): session wiring, audio frame normalization (resample to the model's rate),
   turn-taking, participant bookkeeping, transcript stamping, reconnect/backoff, teardown. A concrete
   driver (`ZoomBridge`) implements only the **irreducibly platform-specific** primitives.
2. **Capability-gated optional features.** Methods that not every platform supports are **virtual,
   throwing `BridgeCapabilityNotSupportedError` by default**. Which features a platform supports is
   declared in **`AIBridgeProvider.SupportedFeatures`** — a single `NVARCHAR(MAX)` JSON column
   **strongly typed via the `IBridgeProviderFeatures` interface** (MJ's JSONType system; the
   interface lives in `metadata/entities/JSONType-interfaces/`). One JSON column instead of ~16
   BIT columns keeps the table simple and lets new features be added without a schema migration —
   just extend the interface. **The engine checks the feature flag first; the throw is
   defense-in-depth.** Metadata says "don't call this," code refuses to pretend.

```mermaid
flowchart TD
    A["Engine wants to SendDTMF()"] --> B{"provider.SupportedFeatures.DTMF?"}
    B -->|"false / omitted (metadata)"| C["skip silently —<br/>never call the driver"]
    B -->|"true"| D["driver.SendDTMF()"]
    D --> E{"driver overrode it?"}
    E -->|"no — base throws<br/>NotSupportedError"| F["bug surfaced loudly:<br/>flag lied about capability"]
    E -->|"yes"| G["DTMF tones sent"]

    style C fill:#2d5016,stroke:#1a5c3a,color:#fff
    style F fill:#7a1f1f,stroke:#a02a2a,color:#fff
    style G fill:#2d5016,stroke:#1a5c3a,color:#fff
```

**Abstract (every bridge MUST implement):**
- `Connect(ctx)` — join the meeting / place or accept the call; return the bot participant handle.
- `Disconnect(reason)` — leave / hang up cleanly.
- `SendMedia(track, frame)` — outbound media (audio/video/screen) into the meeting/call
  (← `IRealtimeSession.OnOutput`). Audio is just one track.
- `OnMedia(handler)` — inbound media (→ `IRealtimeSession.SendInput`); audio carries speaker labels
  when the platform diarizes.

**Virtual / capability-gated (throw `NotSupported` unless overridden; gated by `SupportedFeatures`):**
- `OnParticipantChange(handler)` / `GetParticipants()` — roster + diarization mapping.
- `SendDTMF(digits)` / `OnDTMF(handler)` — **telephony** (`DTMF`).
- `TransferCall(target)` — **telephony** (`CallTransfer`).
- `StartRecording()` — `Recording`.
- Video/screen tracks are gated by the directional media flags (`VideoIn/Out`, `ScreenIn/Out`).

*(Interactive surfaces — hand-raise, in-meeting chat, native whiteboard — are NOT driver methods;
they are CHANNELS the bridge contributes, see §4b.)*

A driver advertises what it overrode; the **`SupportedFeatures` JSON must match** (validated server-side).

---

## 4. Data model

**No new "session" entity.** The session *is* the existing `AIAgentSession` — the bridge is an
**attachment** to it, exactly parallel to how `AIAgentSessionChannel` attaches the whiteboard. This
is the single biggest reuse win: one session record, one lifecycle, one persistence/transcript path,
whether the media plane is a browser, a Zoom room, or a phone line.

**Five new entities** (per open question #6, the provider-channel junction is in): `AIBridgeProvider`,
`AIBridgeAgentIdentity`, `AIBridgeProviderChannel`, `AIAgentSessionBridge`,
`AIAgentSessionBridgeParticipant`. **The bridge's channels live in the *same* `AIAgentChannel`
registry as MJ-native channels** (open question #6 confirmed: metadata-declared *and* runtime-dynamic
both supported) — that is the "3rd-party channels understood the same basic way as MJ channels"
guarantee, in the schema. Fully runtime-dynamic channels (no registry row) use the
`AIAgentSessionChannel` escape hatch added in a later phase (nullable `ChannelID` + inline definition);
this migration does not modify the shipped `AIAgentSessionChannel`.

```mermaid
erDiagram
    AIAgent ||--o{ AIBridgeAgentIdentity : "reachable as"
    AIBridgeProvider ||--o{ AIBridgeAgentIdentity : "on platform"
    AIBridgeProvider ||--o{ AIAgentSessionBridge : "transports via"
    AIBridgeProvider ||--o{ AIBridgeProviderChannel : "contributes"
    AIAgentChannel ||--o{ AIBridgeProviderChannel : "as channel"
    AIAgentSession ||--o| AIAgentSessionBridge : "bridged by"
    AIAgentSessionBridge ||--o{ AIAgentSessionBridgeParticipant : "has"
    User ||--o{ AIAgentSessionBridgeParticipant : "is (if matched)"

    AIBridgeProvider {
        uuid ID PK
        string Name "Zoom, Microsoft Teams, Twilio…"
        string BridgeType "Meeting | Telephony"
        string DriverClass "ClassFactory key"
        string Status "Active | Disabled"
        string SupportedFeatures "JSON (IBridgeProviderFeatures): join methods, directional media tracks (audio/video/screen in+out), diarization, DTMF, transfer, recording"
        string ConfigSchema "JSON Schema"
        string Configuration "JSON"
    }
    AIBridgeAgentIdentity {
        uuid ID PK
        uuid AgentID FK
        uuid ProviderID FK
        string IdentityType "Email | PhoneNumber | AccountID"
        string IdentityValue "sage@org.com / +1555…"
        string DisplayName
        bool IsActive
        string Configuration "JSON"
    }
    AIBridgeProviderChannel {
        uuid ID PK
        uuid ProviderID FK "→ AIBridgeProvider"
        uuid ChannelID FK "→ AIAgentChannel (same registry as MJ channels)"
        bool IsDefault "auto-attach on connect"
        int Sequence
        string Configuration "JSON — per-provider channel config"
    }
    AIAgentSessionBridge {
        uuid ID PK
        uuid AgentSessionID FK "→ AIAgentSession"
        uuid ProviderID FK
        string Direction "Inbound | Outbound"
        string JoinMethod "OnDemand|Scheduled|Invite|NativeInvite|InboundRoute|InMeetingCommand"
        string TurnMode "Passive | Active | Hybrid"
        string ExternalConnectionID "meeting id / call SID"
        string Address "join URL / phone number"
        string BotParticipantID
        string Status "Pending|Scheduled|Connecting|Connected|Disconnecting|Disconnected|Failed"
        datetime ScheduledStartTime
        datetime ConnectedAt
        datetime DisconnectedAt
        string CloseReason "Explicit|HostEnded|Janitor|Error|Shutdown"
        string HostInstanceID "server node affinity"
        string Config "JSON"
    }
    AIAgentSessionBridgeParticipant {
        uuid ID PK
        uuid SessionBridgeID FK
        string ExternalParticipantID
        string DisplayName
        string Role "Host|CoHost|Participant|Agent"
        uuid UserID FK "nullable — matched MJ user"
        bool IsAgent
        datetime JoinedAt
        datetime LeftAt
    }
```

Telephony reuses **the same five tables** with no schema change: `BridgeType='Telephony'`,
`IdentityType='PhoneNumber'`, `Direction='Inbound'|'Outbound'`, and `SupportedFeatures` with
`{ DTMF, OutboundDial, CallTransfer }` on. That is the proof the model is genuinely unified.

**`SupportedFeatures` is one strongly-typed JSON column, not ~16 BIT columns** — bound to the
`IBridgeProviderFeatures` interface via MJ's JSONType system (`metadata/entities/JSONType-interfaces/
IBridgeProviderFeatures.ts` + a `.entity-field-jsontype-bridges.json` sync file applied after
CodeGen). It holds *transport/media* concerns only (join methods, directional media tracks,
diarization, DTMF/transfer, recording). The *interactive* surfaces — hand-raise, in-meeting chat,
the native whiteboard — are **not** features here; they are **channels the bridge contributes**
(next section). New platform features need no schema change — just extend the interface.

**Reference data** (the provider rows + their `SupportedFeatures` JSON) is seeded via **mj-sync
metadata, never SQL INSERTs**, per convention. The migration creates only the five tables + columns.

---

## 4b. Bridges contribute channels — the tool & signaling plane

A bridge is **not just a media pipe.** It is also a **channel contributor**, and this reuses MJ's
existing channel architecture (`AIAgentChannel` / `AIAgentSessionChannel` / `BaseRealtimeChannelServer`
+ the `RealtimeToolBroker` + the perception feed) wholesale. A **channel** is the unit that carries:

- a **tool vocabulary** — what the agent can *do* on a surface (draw, raise hand, call on a person,
  navigate a browser), contributed into the session's tool set; and
- a **signaling / perception feed** — what the agent *sees* happening on that surface (a stroke
  landed, a hand went up, who's speaking, the browser navigated), streamed back as perception; and
- optional **state** (the board, the roster) persisted on the session-channel row.

The crucial evolution: **channels have two origins, and a bridge can contribute any number of them —
not only the metadata-defined ones.**

```mermaid
flowchart TD
    subgraph Static["STATIC channels (metadata: AIAgentChannel)"]
        WB["MJ Whiteboard<br/>works in ANY transport"]
        RB["Remote Browser / Screen Share<br/>(in-house, new)"]
    end
    subgraph Dynamic["DYNAMIC channels (bridge declares at connect)"]
        MC["Meeting Controls<br/>hand-raise queue · roster · who's-speaking · timer"]
        NW["Zoom Native Whiteboard<br/>(only exists when bridged to Zoom)"]
    end
    ABT["Agent base tools"]
    Static --> ASM["Per-session tool vocabulary<br/>(assembled live)"]
    Dynamic --> ASM
    ABT --> ASM
    ASM --> AGENT["The realtime agent —<br/>tools to act, signals to perceive"]
    AGENT -.signals back.-> Static & Dynamic

    style Dynamic fill:#7a4a1f,stroke:#a0632a,color:#fff
    style ASM fill:#5a3d7a,stroke:#7c5295,color:#fff
```

- **Static channels** are registered in `AIAgentChannel` metadata and resolved by ClassFactory exactly
  as today (the MJ Whiteboard is transport-agnostic — it renders in the browser console *or* gets
  surfaced into a meeting via a video/screen track).
- **Dynamic channels** are declared by the **bridge** at connect time and may have **no pre-seeded
  registry row** — the bridge contributes their tool vocabulary + signaling at runtime. Zoom's native
  whiteboard or a meeting-controls surface only exist *because* you're bridged to that platform.
- The **per-session tool vocabulary is assembled live**: agent base tools + every active channel's
  tools (static and bridge-contributed). This is precisely the deferred "channel tool contribution
  feeding `RealtimeSessionRunner.ExtraTools`" the realtime guide flags as a TODO — the bridge is the
  thing that finally drives it.

### Hand-raise is a tool; the hand-raise *queue* is signal intel

Raising a hand is a **tool** the agent invokes on the **Meeting Controls** channel. But the richer
value is the **signaling**: the channel feeds the agent *who else has raised hands, in what order,
who's speaking, how long they've spoken, time remaining*. With that intel an agent can take the
**facilitator** role — call on people in order, enforce time, summarize, move the agenda — entirely
through one channel's tools + perception. None of that is platform code; it's a channel.

### Screen-share / Remote Browser — an in-house channel that proves the media-agnostic point

An agent spins up a **container running a remote browser** (Playwright). That channel offers:

- a **video/screen track** out (the live browser, screen-shared into the meeting) — only possible
  because the transport carries **video, not just audio**;
- a **tool vocabulary** (navigate, click, type, scroll, highlight) the agent drives while talking;
- optional **inbound control** so a human on the call can grab the wheel (collaborative demo).

Picture a sales agent firing up a live product demo in a remote browser, narrating it, taking
questions, and changing what it shows on the fly — or handing control to the prospect. That is one
**channel** on a media bridge. It's the clearest proof that "channel" ≠ "structured whiteboard
deltas" and "transport" ≠ "audio": both must be first-class media + tool + signaling abstractions.

### Are 3rd-party channels *really* the same as MJ channels? Yes — with eyes open

A bridge-contributed (3rd-party) channel **is** an MJ channel: tool vocabulary + signaling/perception
+ optional state, routed through the existing `RealtimeToolBroker` and perception feed. The *only*
new property is that some of its tooling is **dynamic** (known at runtime / sourced from the
platform) rather than hardcoded in a plugin class. That is genuinely workable, and it's the right
model — but making it *literal* requires four evolutions of the channel contract. **Crucially, none
are new risk: all four are already on the realtime roadmap as deferred items the bridge program was
always going to build** (the guide flags the server-side channel path as a TODO):

| Evolution | What changes | Risk |
|---|---|---|
| **Dynamic tool definitions** | `GetToolDefinitions()` may return **runtime-computed** tools (per session / per platform state), not only constants. The assembly into `RealtimeSessionRunner.ExtraTools` is the deferred TODO the bridge finally drives. | Low — the method already exists; we let its return value be dynamic. |
| **Server-side channel execution** | Today channel tools execute **client-side** (browser). A bot has no browser → bridge channels execute **server-side**. This is the *same* work as Phase 0 (completing the server-bridged path); the bridge is what stands up the per-session server channel host that is currently a stub. | Medium — real work, but **already in scope as the foundation**, not extra. |
| **Optional client surface** | `BaseRealtimeChannelClient` assumes a rendered Angular surface (`GetSurfaceComponent()`). A Zoom-native whiteboard has **no MJ client surface** (it lives in Zoom). The contract must allow **server-only** channels (and *optional* observer-only client views). | Low — make the surface optional. |
| **Channel-type identity** | Known 3rd-party channels (Meeting Controls, Zoom Whiteboard) get **registry rows** (`AIAgentChannel`) for discoverability; *truly* ad-hoc ones need the **nullable-`ChannelID` + inline definition** escape hatch (open question #6). | Low — schema decision. |

Already solved, no new work: **tool-name collision** (the existing `ToolNamePrefix` namespaces each
channel's tools), and **authorization/trust** (bridge tools run through the same broker under the
session's user context + authorization, exactly like any agent tool).

**The one honest dependency to call out:** "3rd-party channel = MJ channel with dynamic tooling" is
true, but it is **not** a free plug-in to *today's* shipped code — today's channels are client-direct
(browser-executed) and the server-side channel host is a stub. The bridge program **builds** that
server-side path in Phase 0, and from then on MJ-native and 3rd-party channels share it **identically**.
So: workable and correct, with the server-side channel execution as the known foundational lift.

---

## 4c. Multi-party is an emergent property of the bridge, not a separate build

Your earlier [multi-party plan](multi-party-and-meeting-bridge.md) had two hard, deferred tracks —
**A: agent panels** (multiple co-agents + a human, with a custom FloorManager) and **B: multiple
humans in one session** (which needed us to stand up an SFU and "not rebuild Zoom"). **The bridge
collapses both into itself**, because we let the conferencing platform *be* the shared room — it
already does the SFU, the mixing, the multi-party media plane.

```mermaid
graph TD
    subgraph Room["One Zoom / Teams / LiveKit room (the shared media plane)"]
        H1["Human 1"]
        H2["Human 2"]
        SAGE["Sage<br/>(bridge connection → its own AIAgentSession)"]
        DEMO["Demo Loop<br/>(bridge connection → its own AIAgentSession)"]
    end
    H1 <--> SAGE
    H2 <--> SAGE
    SAGE <-->|"hear each other through the room's own mix"| DEMO
    H1 <--> DEMO
    H2 <--> DEMO

    style SAGE fill:#1f3a5f,stroke:#2d8659,color:#fff
    style DEMO fill:#1f3a5f,stroke:#2d8659,color:#fff
```

- **Multiple humans?** The platform already provides it. We build nothing.
- **Multiple agents?** Each agent is an **independent bridge connection** (its own bot, its own
  `AIAgentSession`) into the *same* meeting. **Sage and Demo Loop both joining one Zoom call literally
  hear each other** — Sage's voice is part of "everyone else" in Demo Loop's inbound mix, and vice
  versa. No transcript-relay hack; they share the room's native audio (and soon video).
- **Agent-to-agent + humans, all talking?** Yes — they're all just participants in one room.
- **The "experimental arena"** (two agents conversing, humans observing/steering) = two agents in a
  private meeting. The meeting *is* the arena.

**The one genuinely new problem is turn-taking discipline among multiple agents** so they don't talk
over each other or loop forever — and that is exactly the passive/active/hybrid policy we're already
building (§6). Two **passive** agents never loop (neither speaks unless addressed by name); a
**facilitator** agent (Meeting Controls channel) can arbitrate explicitly.

**Self-hosted rooms when you don't want to depend on Zoom:** an MJ-native multi-party experience
(e.g. embedded in Explorer) is just a **LiveKit "bridge"** providing the same multi-party room —
*another bridge, not a special build*. The architecture treats a Zoom meeting, a Teams meeting, and
an MJ-native LiveKit room **identically**: all are multi-party media transports. This is why the
earlier "A/B" tracks shouldn't be built standalone — **the entire multi-party roadmap is "put 1+
agents into a shared room, where a bridge provides the room."**

*Caveats:* per-bot-minute platform cost scales with agent count; a bot must not hear its own echo
(platforms exclude your own audio from your inbound mix — gate if a given platform doesn't); and
bot admission/permissions are per-platform.

---

## 4d. The Remote Browser channel — spec (follow-on phase)

The single most compelling channel, and the one that most demands the media-agnostic transport: an
agent **spins up a container running a real browser (Playwright), screen-shares it live, drives it
while talking, and can hand the wheel to a human** — a sales agent running an interactive product
demo, a support agent walking a user through a UI, a research agent showing what it found. This is an
**in-house MJ channel** (`RemoteBrowserChannel`), transport-agnostic: in a browser console session
its video renders in a panel; in a Zoom/Teams meeting it screen-shares into the room. It is a
**follow-on phase** (it needs the media-track plane + container orchestration), specced here so it's
built in this same program.

```mermaid
graph TD
    AGENT["Agent (realtime session)"]
    subgraph CH["RemoteBrowserChannel (server-side MJ channel)"]
        TOOLS["Tool vocabulary<br/>OpenUrl · Click · Type · Scroll ·<br/>Highlight · Back/Forward · Screenshot ·<br/>GetPageText · WaitFor"]
        PERC["Perception feed<br/>nav events · current URL · DOM-ready ·<br/>console errors · screenshots"]
        CTRL["Control arbiter<br/>agent ⇄ human handoff"]
    end
    subgraph ORCH["Container orchestrator"]
        POOL["ephemeral, sandboxed, per-session<br/>ANY Docker image with Playwright"]
        PW["Playwright server + Chromium"]
        CAP["viewport capture (CDP screencast / Xvfb)"]
    end
    BRIDGE["Media bridge<br/>(screen/video track OUT)"]

    AGENT -->|invoke tools| TOOLS --> PW
    PW --> PERC -->|sees the page| AGENT
    PW --> CAP -->|encoded video| BRIDGE -->|"screen-share into meeting / panel in console"| Viewers["Humans on the call"]
    Viewers -.grab the wheel.-> CTRL --> PW
    TOOLS --> ORCH

    style CH fill:#1f3a5f,stroke:#264f7a,color:#fff
    style ORCH fill:#7a4a1f,stroke:#a0632a,color:#fff
```

**Components:**

1. **Container orchestrator** — spins up / tears down an **ephemeral, sandboxed container per session
   from *any* Docker image that supports Playwright** (a default MJ image, or a customer-supplied one
   for a specific demo environment). Resource-limited, network-egress-controlled, no access to MJ
   internals, auto-reaped on session end or idle. Pluggable backend (local Docker API → a container
   service / K8s in production) behind a `ContainerRunner` abstraction so orchestration is itself
   swappable.
2. **Browser control** — a Playwright server inside the container; the channel's tools map to
   Playwright actions (`OpenUrl`, `Click` by selector or coordinates, `Type`, `Scroll`, `Highlight`,
   `Back`/`Forward`, `WaitFor`). Dynamic tool vocabulary (per §4b) — e.g. a demo can register
   app-specific shortcuts.
3. **Video out** — capture the page viewport (CDP `Page.startScreencast` frames, or a virtual display
   `Xvfb` + screen grab), encode to a video track, and emit through the bridge's **screen/video track**
   (the media-agnostic transport is what makes this possible at all).
4. **Perception** — navigation events, current URL, DOM-ready, console errors, and on-demand
   `Screenshot` / `GetPageText` feed back as the channel's perception so the agent *sees* the page it
   is driving and can react ("the pricing page loaded — let me walk you through the tiers").
5. **Collaborative control** — a human on the call (or in the MJ console) can **grab the wheel**:
   their pointer/keyboard events route into the container's browser. A **control arbiter** mediates
   agent-vs-human control (request/grant/yield), so demos are interactive, not one-way.

**Security & cost:** the container is ephemeral and sandboxed; credentials for any app being demoed
are handled via the credential system, never baked into images; egress is allow-listed; each session
is one container (cost is per-session compute + the realtime session). **Phase placement:** after the
media-track plane and the first meeting bridge work (it consumes both), but within this program.

---

## 5. How an agent joins / connects

This was your direct question. There are five ways in, and the right answer is *several of them,
gated by capability* — but with a clear "native-feeling" headliner.

```mermaid
flowchart TD
    subgraph Outbound["Agent goes TO a meeting/call (outbound)"]
        OD["On-demand<br/>user pastes a join URL in MJ,<br/>clicks 'send Agent here'"]
        SC["Scheduled<br/>MJ Scheduled Action fires at start time<br/>(meeting known ahead)"]
        INV["⭐ Invite / Calendar<br/>organizer adds the agent's identity<br/>(sage@org) to the invite like a person;<br/>a calendar watcher joins at start"]
        NAT["Native inclusion<br/>host adds the agent from inside<br/>Zoom/Teams UI (marketplace app)"]
    end
    subgraph Inbound["Meeting/call comes TO the agent (inbound)"]
        IR["Inbound route<br/>a call to the agent's number, or an invite<br/>to its address, routes to the agent"]
        IMC["In-meeting command<br/>participant types '@agent join' in chat"]
    end

    OD & SC & INV & NAT & IR & IMC --> BIND["AIBridgeEngine creates an<br/>AIAgentSessionBridge (+ AIAgentSession)<br/>and connects the driver"]
    BIND --> LIVE["Agent is live on the bridge"]

    style INV fill:#2d5016,stroke:#1a5c3a,color:#fff
    style BIND fill:#5a3d7a,stroke:#7c5295,color:#fff
```

**Recommendation / sequencing of join methods:**

1. **On-demand + Scheduled first** (Zoom) — fully under our control, no marketplace review, immediate
   demo value. `JoinMethod = OnDemand | Scheduled`.
2. **Invite / Calendar second — the headline UX.** The agent gets a provisioned **identity**
   (`AIBridgeAgentIdentity`: a calendar mailbox for meetings, a phone number for telephony).
   Organizers just **invite the agent like a human**. A calendar/invite watcher (Graph / Google
   Calendar webhooks or polling) matches incoming invites to agent identities, creates a `Scheduled`
   bridge, and joins at start. **This is the most generic method — every platform has calendar
   invites — and the most "native feeling."** It is also exactly how **inbound telephony** works
   (a call to the number → route to the agent), so building the identity model once serves both.
3. **Native marketplace inclusion last** (per-platform app review; `SupportsNativeInvite`).
4. **In-meeting command** opportunistically where a chat API exists (`SupportsInMeetingChat`).

The provider's capability flags declare which methods it supports; `AIAgentSessionBridge.JoinMethod`
records which was used.

### The agent as a first-class identity in the customer's tenant (decision, open question #5)

**Decided:** for invite/calendar joins, each agent gets a **real mailbox/calendar identity in the
customer's own tenant** (their Microsoft 365 / Google Workspace), not an MJ-managed throwaway. This
is the right call and it pays off well beyond meetings:

- **It makes the agent a first-class colleague.** Organizers add `sage@customer.com` to an invite
  exactly like a person; the calendar watcher (Graph / Google Calendar) sees it and the agent joins.
  No special "add a bot" UX — the agent is in the directory.
- **`AIBridgeAgentIdentity` generalizes to "agent presence."** The same row that holds a
  calendar mailbox is the seam for, over time: **email** (the agent reads/sends async — a natural
  follow-on once it has an inbox), **calendar** (proposes/accepts meetings), and **telephony** (the
  phone-number identity for inbound DID). One identity model, many surfaces. The `IdentityType` enum
  (`Email | PhoneNumber | AccountID`) already anticipates this.
- **Provisioning** is delegated-admin: MJ requests (or the customer grants) a mailbox + the minimal
  Graph/Google Admin scopes to watch that calendar and, later, send mail as the agent. The credential
  lives in MJ's credential system, referenced by the identity/provider config — never inline.
- **Governance:** because the identity is in the customer's tenant, their existing retention, DLP,
  eDiscovery, and offboarding all apply to the agent automatically — a real compliance win vs. a
  shadow MJ identity.

**Open sub-question for later phases (not blocking the migration):** the exact provisioning
handshake (self-service admin-consent flow vs. customer creates the mailbox and shares credentials).
The schema is ready either way — `AIBridgeAgentIdentity` + provider `Configuration` carry it.

---

## 6. Audio + turn-taking (passive / active / hybrid)

Turn-taking is **generic and platform-agnostic** — it operates on the diarized transcript stream
the bridge provides, lives in the engine layer, and is identical for Zoom or Twilio. All three modes
ship together (your ask).

```mermaid
sequenceDiagram
    participant M as Meeting / Call (humans)
    participant BR as Bridge driver (Zoom/Twilio)
    participant TT as TurnTakingPolicy (generic)
    participant RS as IRealtimeSession (the agent)

    M->>BR: speech audio (+ speaker labels)
    BR->>RS: SendInput(audio)  %% the agent always HEARS
    RS-->>TT: streamed transcript (diarized)
    Note over TT: gate GENERATION by mode
    alt Passive (default) — only when addressed
        TT->>TT: name/mention classifier on transcript
        TT-->>RS: speak ONLY if agent was addressed
    else Active — proactive in gaps
        TT->>TT: "worth saying?" scorer, silence-window only
        TT-->>RS: speak in a gap, never over a speaker
    else Hybrid — passive voice + chat hand-raise
        TT-->>RS: speak only when addressed
        TT->>BR: PostChatMessage("I can add…")  %% if SupportsInMeetingChat
    end
    RS->>BR: OnOutput(audio)  %% agent speaks
    BR->>M: agent voice into the meeting/call
```

- **Passive (default).** Generation gated on the agent being **addressed** — name/mention detection
  on the diarized transcript (fast regex + an LLM fallback for indirect address like "what does our
  AI think?"). The agent always *hears* (so it has context) but only *speaks* when called on.
- **Active.** A "do I have something worth saying" scorer that fires **only in silence windows**
  (never barging over a live speaker), throttled so it can't dominate.
- **Hybrid.** Passive voice **plus** the agent posts to meeting chat when it has something to add —
  the social-cost-free "raise hand." Requires `SupportsInMeetingChat`; degrades to plain passive
  where chat isn't available.

`AIAgentSessionBridge.TurnMode` selects the mode per session; the default is `Passive`.

---

## 7. Session lifecycle (state machine)

The bridge binding's `Status` is its own small state machine; the underlying `AIAgentSession`
lifecycle (Active/Idle/Closed + the janitor) is **reused unchanged**.

```mermaid
stateDiagram-v2
    [*] --> Pending: created (on-demand / inbound)
    [*] --> Scheduled: created with ScheduledStartTime
    Scheduled --> Connecting: scheduled action / watcher fires
    Pending --> Connecting: engine dials/joins
    Connecting --> Connected: bot admitted, audio flowing
    Connecting --> Failed: join rejected / timeout
    Connected --> Disconnecting: leave requested / host ended
    Connected --> Failed: transport error
    Disconnecting --> Disconnected: clean teardown
    Failed --> [*]
    Disconnected --> [*]

    note right of Connecting
        HostInstanceID stamped here
        for node affinity; the janitor
        reconciles orphans if the node dies
    end note
```

Persistence reuse: the **transcript** is the same session-stamped `Conversation Detail` rows; the
**whiteboard / channel state** rides the same `AIAgentSessionChannel` rows; **artifacts** link the
same way. A bridged session reviews in the existing console with zero new persistence code.

---

## 8. Platform rollout & capability matrix

Build **Zoom end-to-end first**; only once it works do we add the others — each a **minimal subclass**
(the generic base + engine carry the weight). Telephony (Twilio) is a first-class later phase on the
same engine, not a separate effort.

| Capability | Zoom | Teams | Slack | Meet | Webex | Discord | RingCentral | Twilio | Vonage |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| On-demand join | ✅ | ✅ | ✅ huddle | ⚠️ | ✅ | ✅ | ✅ | n/a | n/a |
| Scheduled join | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | n/a | n/a |
| Invite / calendar | ✅ | ✅ | ⚠️ | ✅ | ✅ | ➖ | ✅ | ✅ DID | ✅ DID |
| Outbound dial | n/a | n/a | n/a | n/a | n/a | n/a | ✅ | ✅ | ✅ |
| Inbound routing | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Audio in/out | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Video in/out | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ |
| Screen in/out | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | n/a |
| Speaker diarization | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ➖ | ➖ |
| In-meeting chat (chan.) | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | n/a | n/a |
| Hand raise (chan.) | ✅ | ⚠️ | ⚠️ | ➖ | ⚠️ | ➖ | ⚠️ | n/a | n/a |
| DTMF / transfer | n/a | n/a | n/a | n/a | n/a | n/a | ✅ | ✅ | ✅ |

✅ supported · ⚠️ partial / needs verification · ➖ not offered · The matrix becomes the seed metadata
flags. **Slack is in scope as a FULL meeting bridge** — modern Slack huddles do full audio + video +
screen share. The one thing to **verify early** is bot/media API access to huddles (Slack huddles run
on Amazon Chime under the hood; we must confirm a public join-with-media path exists, else Slack needs
a Chime-SDK-level integration). Treat the huddle-media-API as the gating unknown, not the AV
capability itself.

### The platform landscape — **all of these are in scope to build**

Four categories — they bucket differently in this architecture, but every destination/UCaaS/CPaaS row
below is a driver we intend to ship:

- **Destination platforms** (people *meet* there → meeting bridges): **Zoom · Microsoft Teams ·
  Google Meet** (the big three), **Cisco Webex** (still a major *enterprise* player in 2026 — finance,
  healthcare, government, education, Cisco-heavy shops; actively developed Webex Suite + AI Assistant;
  real bot/embedded-app SDK), **Slack** (full-AV huddles — verify media API), **Discord** (huge for
  community/education/gaming/some business; first-class voice channels + mature bot API, easy media).
  *Skip (EOL/fading): BlueJeans (Verizon discontinued), GoTo Meeting.*
- **UCaaS — meetings *and* telephony in one** (one driver exercises both families): **RingCentral**
  (in scope). Also notable: Dialpad (AI-first), 8x8, Zoom Phone.
- **CPaaS — comms infrastructure** (telephony, Phase 5): **Twilio** (lead) + **Vonage** (in scope).
  Also: Amazon Chime SDK, Telnyx.
- **SFU / embeddable infrastructure** — **NOT a bridge destination**; the candidate for our **own**
  multi-party room (§4c): **LiveKit** (lead — open-source, self-hostable, already has OpenAI/Gemini
  realtime adapters), Daily.co, Agora. Run as the "MJ-native room" bridge, not connected *out* to.

**Confirmed build set this program:** Zoom (first) → Teams → Google Meet → Webex → Slack → Discord →
RingCentral (UCaaS) → Twilio → Vonage, plus LiveKit as the MJ-native-room bridge. *WhatsApp Business
calling* is the watch-list global add as its API matures.

---

## 9. Implementation phases

| Phase | Deliverable |
|---|---|
| **0 — Transport seam** | Complete the server-bridged realtime **media** transport: `BaseRealtimeBridge` abstract (media tracks + capability methods) + the engine wiring `SendInput`/`OnOutput` ↔ `RealtimeSessionRunner`; a loopback test bridge proves media round-trips with no platform. The unification foundation. |
| **1 — Schema + engines** | The migration (5 entities) → CodeGen → `AIBridgeEngineBase` + `AIBridgeEngine` + capability-gated base driver + the platform-agnostic turn-taking policy (passive/active/hybrid). |
| **2 — Server-side channel plane** | Complete the deferred server-side channel execution: dynamic tool-definition contribution into `RealtimeSessionRunner.ExtraTools`, optional client surface, the `Meeting Controls` channel (roster/hand-raise-queue/who's-speaking/timer → facilitator). Makes 3rd-party channels = MJ channels. |
| **3 — Zoom meeting bridge** | `ZoomBridge` (on-demand + scheduled join), participant diarization, all three turn modes, Zoom-native channels (chat, whiteboard), observer console reuse. First real platform, end-to-end. |
| **4 — Invite/calendar joins + agent identity** | `AIBridgeAgentIdentity` (tenant mailbox) + the calendar watcher: "invite the agent like a person." Headline UX; shared with inbound telephony. |
| **5 — Teams → Google Meet → Webex → Slack → Discord** | Minimal subclasses on the proven base, one at a time, each with its capability metadata + native channels. |
| **6 — Telephony: RingCentral (UCaaS) → Twilio → Vonage** | `BaseTelephonyBridge`: **outbound** (agent places calls) + **inbound** (DID routes to the agent), DTMF, transfer. Same engine/session/turn-taking. |
| **7 — Multi-party** | 1+ agents in one shared room (emergent — §4c); multi-agent turn-taking discipline; the LiveKit MJ-native-room bridge. Kills the standalone agent-panel/multi-human tracks. |
| **8 — Remote Browser channel** | `RemoteBrowserChannel` + `ContainerRunner` (any Playwright Docker image), screen-track out, control arbiter (§4d). |
| **9 — Native marketplace inclusion** | Per-platform apps for in-UI "add the agent." App-review gated; last. |
| **UI — Realtime management dashboard + forms** | A new **Realtime** section in the AI dashboard (`@memberjunction/ng-dashboards`) managing the whole realtime + bridge surface; custom Extended forms for the major new entities; a Realtime panel on the AIAgent form. Starts right after CodeGen; the dashboard fills in as backend phases land. |

```mermaid
graph LR
    P0["0 · Transport seam"] --> P1["1 · Schema + engines"]
    P1 --> P2["2 · Server channel plane"]
    P2 --> P3["3 · Zoom"]
    P3 --> P4["4 · Invite/identity"]
    P3 --> P5["5 · Teams·Meet·Webex·Slack·Discord"]
    P4 --> P6["6 · Telephony<br/>RingCentral·Twilio·Vonage"]
    P5 --> P7["7 · Multi-party + LiveKit"]
    P6 --> P7
    P3 --> P8["8 · Remote Browser"]
    P5 --> P9["9 · Native apps"]
    P6 --> P9

    style P1 fill:#5a3d7a,stroke:#7c5295,color:#fff
    style P3 fill:#7a4a1f,stroke:#a0632a,color:#fff
    style P6 fill:#1f5a5a,stroke:#2a8080,color:#fff
```

> **The migration covers Phase 1 only.** Everything from Phase 0 onward is code I build solo once
> CodeGen has run — see the Work Breakdown Structure (§13) for the resumable task list.

---

## 11b. UI — Realtime management dashboard & entity forms

Two deliverables, both built on MJ's generated-forms + dashboard frameworks (per
[DASHBOARD_BEST_PRACTICES](../../guides/DASHBOARD_BEST_PRACTICES.md) and
[FORMS_ARCHITECTURE_GUIDE](../../guides/FORMS_ARCHITECTURE_GUIDE.md)) — and it manages the **whole**
realtime surface, not just bridges.

**1. The "Realtime" section in the AI dashboard (`@memberjunction/ng-dashboards`).** A new top-level
section (page chrome: `<mj-page-layout>` + header/body trio; data via `BaseEngine` subclasses, never
Angular data services; prefs via `UserInfoEngine`; `--mj-*` tokens; `NotifyLoadComplete`):

- **Live Sessions** — active `AIAgentSession`s + their `AIAgentSessionBridge`: who is on which
  call/meeting right now, status, turn mode, participants; one click into the **observer console**
  (the read-only monitor from §1) to watch a live bridged session.
- **Bridge Providers** — the platform registry: the `SupportedFeatures` capability matrix, status
  toggle, credentials/config (referenced, never shown).
- **Agent Identities** — which agents are reachable where (calendar mailboxes, phone numbers).
- **Channels** — the `AIAgentChannel` registry incl. bridge-contributed; which providers contribute
  which (`AIBridgeProviderChannel`).
- **Co-Agents** — the `AIAgentCoAgent` pairing registry (already shipped; surfaced here too).
- **Session History** — past sessions, transcripts, recordings, one-click review launch.
- **Metrics** — sessions over time, by platform / agent, duration, and (later) cost — reusing the AI
  dashboard's existing charting patterns.

**2. Entity forms.** Generated base forms come free from CodeGen for all five new entities; we add
**custom `*Extended` forms** for the major ones with real UX:

- `AIBridgeProviderFormExtended` — a **capability editor** (feature toggles backed by the
  `SupportedFeatures` JSON through the typed `SupportedFeaturesObject` accessor), status, and the
  channels the provider contributes.
- `AIAgentSessionBridgeFormExtended` — the live/historical bridge: participants, lifecycle timeline,
  links to the session + observer console.
- `AIBridgeAgentIdentityFormExtended` — identity provisioning UX (tenant mailbox / phone number).
- The provider-channel and session-bridge-participant forms can stay generated.

**3. AIAgent form integration.** Add a **Realtime panel** to the AIAgent form via the
`BaseFormPanel` slot system (no regeneration) showing the agent's whole realtime presence in one
place: co-agent pairings, `TypeConfiguration`, bridge agent identities, default co-agent.

This phase **starts right after CodeGen** (forms + the AIAgent panel are immediately useful) and the
dashboard's live/metrics surfaces fill in as the engine and bridges land.

---

## 12. Per-phase quality bar (non-negotiable, every phase)

Every phase is "done" only when **all** of the following hold — this is baked into each WBS block:

1. **World-class docs.**
   - **JSDoc/TSDoc on every public class, method, property, and exported type** — the *why*, not just
     the *what*; document capability gating, throw conditions, and reuse seams.
   - **A `README.md` for every new package** (purpose, install, the public API, usage examples,
     how it composes with the realtime engine).
   - **A guide in `/guides`** — `REALTIME_BRIDGES_GUIDE.md` (created in Phase 0, extended each phase)
     covering the architecture, how to add a new bridge driver, capability gating, channel
     contribution, turn-taking, and the observer console. Cross-linked from the root `CLAUDE.md` index
     and the realtime co-agents guide.
2. **Naming conventions (repo rules).** PascalCase for public class members (properties, methods,
   `@Input`/`@Output`), camelCase for private/protected; PascalCase classes/interfaces; union types
   over enums; no `any`, no weak `.Get()/.Set()` (use generated typed properties post-CodeGen).
3. **Tests.**
   - **Extensive NEW unit tests for all new functionality** (vitest; `@memberjunction/test-utils`;
     injectable seams so no network/DB — mirror the realtime driver test pattern). Target the engine
     logic, capability gating, turn-taking policy, each driver's frame translation, and the channel
     tool/perception wiring.
   - **Full-repo unit tests pass** (`npx turbo run test --filter='!@memberjunction/sql-converter'`) —
     the PG-migration-parity suite is the only sanctioned exception; **everything else must be green**.
   - Report pass/fail counts at the end of each phase.
4. **Build green.** Each touched package builds (`npm run build`); the manifests regenerate if any
   `@RegisterClass` is added; the full repo build passes before a phase is marked complete.
5. **Commit at clean points.** After CodeGen, commit/push at each logical milestone with a detailed
   message; a changeset per phase (minor where a migration is added, patch otherwise).

---

## 10. Security, multi-tenancy & cost

- **Provider credentials** (Zoom SDK keys, Twilio auth) resolve through MJ's credential system
  (`GetAIAPIKey`-style), never hardcoded; referenced by `AIBridgeProvider.Configuration`.
- **Authorization to bridge** — joining an external meeting / placing a call on the org's behalf is a
  privileged action; gated by a dedicated authorization (mirroring `Realtime: Advanced Session
  Controls`), and every bridge session is owned by a `UserID` and fully audited via the session +
  Record Changes.
- **Recording/consent** — `SupportsRecording` and per-jurisdiction consent handling are explicit
  capability + config concerns, not silent defaults.
- **Cost** — each bridged session is one realtime provider session (audio tokens) + the platform's
  per-minute bot/telephony cost; linear and attributable per `AIAgentSession`.
- **Host affinity + janitor** — `HostInstanceID` + the reconcile sweep (copied from the realtime
  session model) handle node death without leaking live bot connections.

---

## 11. Open questions for review

1. **Package placement** — propose `packages/AI/BridgeBase` (`@memberjunction/ai-bridge-base`) +
   `packages/AI/Bridge` (`@memberjunction/ai-bridge-server`), beside the realtime packages. Agree?
   - YES

2. **Naming** — `AIBridgeProvider` / `AIAgentSessionBridge` etc. vs. a shorter prefix
   (`BridgeProvider`?). I lean on `…Bridge…` tied to `AIAgentSession` for discoverability.
   - AIAgentSessionBridget is good I think so stays in AI...

3. **Phase 0 scope** — do we land the transport seam + a loopback test bridge as its **own** small PR
   first (proves the unification with zero platform risk), then schema/engines? I recommend yes.
   - Yes

4. **Slack** — confirm we treat it as **text/hand-raise only**, not an audio bridge.
   - They have full blwon video conf,that's what I'm referering to using

5. **Identity provisioning** — for invite/calendar joins, do agent mailboxes live in the customer's
   tenant (their M365/Google) or an MJ-managed identity? Affects Phase 3.
   - I think agents get an inbox in the customer's tenant and over time that can be used for email, thoughts?

6. **Bridge-contributed channels (§4b)** — do we add a 5th entity `AIBridgeProviderChannel`
   (a junction declaring which registered channels a provider contributes by default, e.g. Zoom →
   Meeting Controls + Native Whiteboard), while still allowing fully *runtime-contributed* channels
   with no registry row? I lean yes — it makes the common case discoverable in metadata without
   blocking dynamic ones. Confirms whether the migration is 4 or 5 entities.

  - metadata good but doesn't preclude dynamic (either inside MJ channels or bridge channels dyanmic option is good to have )

7. **Multi-party (§4c)** — confirm we treat multi-agent + multi-human as an **emergent property of
   the bridge** (1+ agents in a shared room) and do **not** build the standalone "agent panel" /
   "multiple humans" tracks from the earlier plan. LiveKit becomes the MJ-native-room *bridge*, not
   a special path. This supersedes [multi-party-and-meeting-bridge.md](multi-party-and-meeting-bridge.md).

   yep, exactly, that's were we do it, we kill that off and update that plan and point to this. Will be WAY better this way.

8. **Screen-share / Remote Browser channel (§4b)** — in scope as an in-house channel for this program
   (it needs the video track + container/Playwright runner), or split to its own initiative once the
   media-track plane lands? It's the strongest media-agnostic proof but carries infra (container orchestration).

   yep, in house channel and we should also build a remote browser ability that allows us to spin up any docker that suports playwright so that it can be used for remote demos, spec out how this should work in the plan - its on follow on phase, but we do it all in one overall giant session


---

## 13. Work Breakdown Structure — **SESSION STATE** (resume here)

> **This section is the live session state.** Each `- [ ]` is a unit of work; I check it off as I go
> and commit the doc, so a fresh session resumes by reading the first unchecked box. The **per-phase
> quality bar (§12)** — JSDoc, package README, the `/guides` guide, repo-wide tests + new tests,
> green build, changeset — applies to **every** phase block and its boxes must all be checked before
> the phase is "done." Skip the `sql-converter` PG suite only.

### Phase 1 — Schema + engines  ✅ CORE DONE (docs/seed pending)
- [x] **Migration** `V202606160900__v5.42.x__Realtime_Bridges.sql` — 5 tables + extended props,
      `SupportedFeatures` JSON column. Ran + CodeGen'd; drift verified 0.
- [x] `IBridgeProviderFeatures` interface + `.entity-field-jsontype-bridges.json` sync file.
- [x] **JSONType sequencing** — binding verified live: typed `SupportedFeaturesObject` accessor +
      `MJAIBridgeProviderEntity_IBridgeProviderFeatures` interface emitted; entity named
      `MJ: AI Bridge Providers` as predicted.
- [x] After CodeGen: generated entity types verified; zero drift; `core-entities` builds.
- [x] `@memberjunction/ai-bridge-base`: `AIBridgeEngineBase` (BaseEngine cache), provider/identity
      resolution. **48 tests.**
- [x] `BaseRealtimeBridge` abstract (media-track contract + capability-gated `NotSupported` methods),
      `BridgeCapabilityNotSupportedError`, union capability types.
- [x] `TurnTakingPolicy` (passive/active/hybrid) — pure, platform-agnostic, injected matcher/scorer/clock.
- [x] `@memberjunction/ai-bridge-server`: `AIBridgeEngine` (composition over base like AIEngine —
      host registry, janitor `ReconcileOrphans`, lifecycle), ClassFactory driver resolution. **24 tests.**
- [x] Server-side `MJ…EntityServer` subclasses + `ValidateAsync` invariants (SupportedFeatures JSON
      shape, identity uniqueness case-insensitive, session cross-field coherence, one agent
      participant/bridge). **MJCoreEntitiesServer 270 tests (+37).**
- [x] Seed metadata (mj-sync): 11 provider rows w/ capability flags (Loopback Active, rest Disabled
      until their driver lands) in `metadata/ai-bridge-providers/`; `Realtime: Advanced Bridge
      Controls` authorization + Developer role mapping. (User runs `mj sync push`.)
- [x] **Quality bar finish:** READMEs (base + server) · `/guides/REALTIME_BRIDGES_GUIDE.md` + CLAUDE.md
      index entry · **full repo build 249/249 + repo tests 491/491 green** · changeset · update PR.

### Phase 0 — Transport seam  ✅ DONE
- [x] `BaseRealtimeBridge` media-track plumbing wired to `IRealtimeSession.SendInput`/`OnOutput`
      (the seam: `bridge.OnMedia → session.SendInput`, `session.OnOutput → bridge.SendMedia`).
- [x] `AIBridgeEngine` ↔ injected `IRealtimeSession` media wiring (server-bridged completion;
      session injected so the engine never constructs the model — fully testable).
- [x] `LoopbackBridge` test driver (in-memory media round-trip, no platform) — proves the seam.
- [ ] Resampling/format normalization to the model's rate — deferred to first real driver (the seam
      translates `BridgeMediaFrame`↔`ArrayBuffer`; per-platform sample-rate conversion lands with Zoom).
- [x] Guide transport-seam section (in `/guides/REALTIME_BRIDGES_GUIDE.md`).

### Phase 2 — Server-side channel plane  ✅ CORE DONE
- [x] Dynamic server-tool contribution: `BaseRealtimeChannelServer.GetServerToolDefinitions()` (runtime-
      computed) + `ExecuteServerTool()` + `ToolNamePrefix`; `RealtimeChannelServerHost` aggregation
      (`GetSessionServerTools` / `ExecuteSessionServerTool`, longest-prefix routing); wired into
      `RealtimeSessionRunner` via the **additive** `ServerChannelTools` + `ExecuteServerChannelTool`
      deps (registered after `ExtraTools`; client-direct path untouched).
- [x] Optional client surface: `BaseRealtimeChannelClient.GetSurfaceComponent()` now defaults to
      `null` + `HasSurface()`; the overlay skips surfaceless channels' tabs; the pane component is
      defensive. (The per-session server channel host already existed — de-stubbed by giving it the
      tool-contribution + execution role.)
- [x] `MeetingControlsChannel` (roster · hand-raise queue · who's-speaking · timer; facilitator tools
      `RaiseHand`/`LowerHand`/`CallOnParticipant`/`MuteParticipant` (capability-gated)/`SetTimer`).
      Server-only (no client surface). Pure `MeetingControlsState` queue/timer logic.
- [x] Channel perception sourced from an injected bridge event stream (`IMeetingControlsEventSource`)
      fed back via the new optional `RealtimeChannelServerContext.SendContextNote`; `ToolNamePrefix`
      namespacing verified by tests.
- [x] **Tests**: AI Core 181, AI Agents 1263 (+109 new across runner/host/state/channel), conversations
      552 (+3 optional-surface) — all green; every touched package builds. Guide section added.
- [x] **Follow-up (flagged) — DONE (Phase 3):** bridge-server channel wiring. `AIBridgeEngine` now wires
      the channel plane generically via the additive optional `IBridgeChannelHost` (declared in
      `ai-bridge-base` so the engine takes no `ai-agents` dependency — the runner-constructing layer
      supplies an adapter over `RealtimeChannelServerHost`) + `BaseRealtimeBridge.GetMeetingControlsEventSource()`
      (default null; overridden by drivers that contribute a facilitator surface). `wireChannelPlane`
      (a) starts the session's channels (`host.StartSessionChannels`), (b) constructs the Meeting Controls
      channel from the driver's event source, (c) surfaces `host.GetSessionServerTools(id)` +
      binds the executor onto `ActiveBridgeSession.ServerChannelTools` / `ExecuteServerChannelTool` for the
      runner layer to register, and (d) feeds the realtime session's `SendContextNote` into the channel
      context. `closeChannelPlane` runs on every stop path. Failure-tolerant. Unit-tested with
      LoopbackBridge + a fake event source + a mock channel host (`channel-plane.test.ts`).

### Phase 3 — Zoom meeting bridge  ✅ CORE DONE (real-SDK binding + observer console pending)
- [x] `@memberjunction/ai-bridge-zoom`: `ZoomBridge` (`@RegisterClass(BaseRealtimeBridge,'ZoomBridge')`)
      — join (on-demand + scheduled via `Address`), audio in/out, diarized participants, mute + chat,
      bot lifecycle. Behind an injectable `IZoomMeetingSdk` seam (creation seam `SetSdkFactory`) so it
      builds + unit-tests with no network; real Zoom Meeting SDK + raw-data adapter is a deployment TODO.
      **24 tests** (FakeZoomSdk): connect/disconnect, audio in→OnMedia (speaker labels) + out→seam,
      participant join/leave → roster + event source, hand-raise → Meeting Controls, capability gating,
      chat.
- [x] Zoom-native channel (Meeting Controls facilitator) via the channel plane —
      `ZoomMeetingControlsEventSource` adapts the seam; the engine's `wireChannelPlane` (Part A) wires it.
- [x] Provider seed: Zoom row flipped `Disabled → Active` (driver now exists). Others stay Disabled.
- [ ] All three turn modes live end-to-end against a real Zoom session (passive shipped via the engine;
      active/hybrid + chat-post need the real SDK).
- [ ] Observer console reuse (read-only monitor of a bridged session).
- [x] **Quality bar (this slice):** READMEs (Zoom) · guide "adding a bridge driver" (Zoom worked example)
      + new "Channel plane" section · BridgeBase 48 / Bridge 29 / BridgeZoom 24 / Agents 1263 tests green;
      all touched packages build.

### Phase 4 — Invite/calendar joins + agent identity  ✅ DONE
- [x] `IAgentIdentityProvisioner` seam + tenant-mailbox model (stub throws-until-bound; Graph/Google
      admin TODO). `AIBridgeAgentIdentity` already holds the result.
- [x] `CalendarWatcher` (injectable `ICalendarSource` → `GraphCalendarSource`/`GoogleCalendarSource`
      stubs) → match invite (attendee) → create Scheduled bridge (`JoinMethod='Invite'`, dedupe via
      `ExternalConnectionID=ExternalEventID`); `ScheduledBridgeRunner` starts due bridges;
      `ResolveProviderFromJoinUrl` (security-aware domain-suffix match). All in `ai-bridge-server`.
- [x] **Quality bar** + guide "Invite & Calendar Joins" section. (ai-bridge-server 73 tests.)

### Phase 5 — Teams → Google Meet → Webex → Slack → Discord  (one driver per box)
- [x] `TeamsBridge` (`@memberjunction/ai-bridge-teams`, ACS calling-bot seam; invite/native/inbound +
      diarization + chat; hand-raise ⚠️). **26 tests.** Seed Active.
- [x] `GoogleMeetBridge` (`@memberjunction/ai-bridge-googlemeet`, Meet Media API seam; no hand-raise/
      chat — handled as absent). **23 tests.** Seed Active.
- [x] `WebexBridge` (`@memberjunction/ai-bridge-webex`, Webex Meetings SDK/xAPI seam; on-demand+
      scheduled+invite, inbound, A/V/screen, diarization, chat; no native-invite). **26 tests.** Active.
- [x] `SlackBridge` (`@memberjunction/ai-bridge-slack`, huddle seam; full AV). **29 tests.** Active.
      ⚠️ **Real-API risk flagged in 4 places**: Slack publishes no documented bot-join-with-media path
      for huddles (Chime-level integration may be required) — verify before production use.
- [x] `DiscordBridge` (`@memberjunction/ai-bridge-discord`, @discordjs/voice seam; voice-channel based —
      on-demand+inbound, per-user diarization, video/screen, chat; NO scheduled/invite/hand-raise).
      **27 tests.** Active; seed features corrected to voice-channel reality.
- [x] **Quality bar** after each driver (full repo build + tests green).

### Phase 6 — Telephony: Twilio → Vonage → RingCentral  ✅ DONE
- [x] `BaseTelephonyBridge` (in ai-bridge-base): `ITelephonyCallSdk` seam (dial/answer/hangup/
      audio/DTMF/transfer); Connect branches outbound(dial)/inbound(answer); overrides
      SendDTMF/OnDTMF/TransferCall; no MeetingControls (no roster). + tests.
- [x] `TwilioBridge` (Programmable Voice + Media Streams, 20 tests), `VonageBridge` (Voice API +
      websocket, 20 tests), `RingCentralBridge` (Call Control API, 20 tests — BridgeType corrected
      to Telephony, telephony-only features). All `extends BaseTelephonyBridge`. Seed Active.
- [x] Inbound (answer)/outbound (dial) flows + DTMF + transfer, capability-gated; the calendar
      watcher's DID/identity routing (Phase 4) feeds inbound. Telephony correctly has no video/screen.
- [x] **Quality bar** + guide telephony coverage. Full repo build + tests 509/509 green.

### Phase 7 — Multi-party  ✅ CORE DONE (real-SDK binding + runner-layer floor wiring pending)
- [x] Multiple agents in one room (N bridge connections); echo/self-audio gating documented (SFU excludes
      own audio — `LiveKitBridge` documents it; gate at the driver where a platform doesn't). The room IS
      the shared media plane (no transcript-relay, no MJ mixer).
- [x] Multi-agent turn-taking discipline: `MultiAgentRoomCoordinator` (pure, in `@memberjunction/ai-bridge-server`)
      — floor arbitration (`CanTakeFloor`/`TakeFloor`/`ReleaseFloor`/`IsFloorHolder`, one agent speaks at a
      time across agents), passive-default loop safety, facilitator override (`FacilitatorOverride` +
      `SetFacilitator`), multi-room isolation. Additive `AIBridgeEngine.RegisterRoomParticipant`/
      `UnregisterRoomParticipant`/`RoomCoordinator` hooks (single-agent sessions unaffected). **20 tests.**
- [x] `LiveKitBridge` as the MJ-native room (`@memberjunction/ai-bridge-livekit`,
      `@RegisterClass(BaseRealtimeBridge,'LiveKitBridge')`) — self-hosted SFU (connect(roomUrl,token) as a
      bot), full A/V/screen in+out, native per-participant diarization, data-channel chat, Meeting Controls
      facilitator surface, room-admin mute. Behind injectable `ILiveKitRoomSdk` seam (`SetSdkFactory`;
      throws "bind the real LiveKit SDK" until bound — real `livekit-server-sdk` + room client is a
      deployment TODO). **24 tests (FakeLiveKitRoomSdk).** Seed: LiveKit provider row flipped
      `Disabled → Active` (the driver now exists), mirroring Zoom/Teams/etc.
- [x] **Update `multi-party-and-meeting-bridge.md` → stub pointing here** (done early — see below).
- [x] **Quality bar (this slice):** READMEs (LiveKit) · guide "Multi-party (LiveKit + multiple agents)"
      section (rewritten Planned → Shipped, roadmap row + reference map) · BridgeLiveKit 24 / ai-bridge-server
      93 (incl. +20 coordinator; existing 73 still green) tests · both packages build. *(Real LiveKit SDK
      adapter binding + runner-layer floor wiring around an agent's generation remain — documented as
      pending.)*

### Phase 8 — Remote Browser channel
- [ ] `ContainerRunner` abstraction (any Playwright Docker image; ephemeral, sandboxed, egress-limited).
- [ ] `RemoteBrowserChannel` (tools, perception, viewport→screen-track, control arbiter).
- [ ] **Quality bar** + guide remote-browser section.

### Phase 9 — Native marketplace inclusion
- [ ] Per-platform "add the agent" apps (Zoom/Teams marketplace) — design + first submission.
- [ ] **Quality bar** + guide.

### Phase UI — Realtime management dashboard + forms  ✅ DONE
- [x] Custom `*Extended` forms: `MJAIBridgeProviderFormComponentExtended` (16-flag SupportedFeatures
      capability editor through the typed `SupportedFeaturesObject` accessor; omit-on-disable),
      `MJAIAgentSessionBridgeFormComponentExtended` (lifecycle timeline + participant grid),
      `MJAIBridgeAgentIdentityFormComponentExtended`. Registered in custom-forms module; pure
      object↔toggles helper unit-tested (14 tests).
- [x] AIAgent form **Realtime panel** (`@RegisterClassEx(BaseFormPanel, …)`, slot `after-fields`,
      falls through to `after-everything` since the custom AIAgent form has no slot marker — graceful
      per PANELS.md): co-agent pairings, TypeConfiguration, bridge identities.
- [x] **Realtime Management** section in the AI dashboard (`@memberjunction/ng-dashboards`): Live
      Sessions, Bridge Providers (capability chips), Agent Identities, Channels (+ contributing
      providers), Co-Agents, Session History, Metrics. Batched `RunViews` (matches the existing
      realtime-analytics sections — no new BaseEngine), `UserInfoEngine` sub-tab pref, design tokens,
      pure metrics helpers unit-tested (11 tests). v1 read-only (observer-console + review-launch
      marked TODO).
- [x] **Quality bar**: ng-dashboards 307 tests; full repo build 249/249 + tests 491/491 green.

### Cross-cutting (do once, early)
- [x] Architecture plan doc (this file) with mermaid + WBS.
- [x] Stub-out `multi-party-and-meeting-bridge.md` to point here (superseded — open question #7).
- [ ] Root `CLAUDE.md` guide-index entry for `REALTIME_BRIDGES_GUIDE.md`.

---

*Next step on this branch: **the migration** (Phase 1, five entities) — Amith reviews it and runs
CodeGen; from there every box above is solo work under the §12 quality bar, checked off and committed
as it lands.*
