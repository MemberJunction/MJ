# Multi-Party Realtime Sessions & Meeting Bridging — Proposal

**Status:** Proposal for discussion (2026-06-12). No code. Studied against the shipped realtime stack on `an-dev-28` (PR #2828): client-direct topology, co-agent pairing junction, `AIAgentSession` lifecycle, interactive channels, transcript relay, progress narration.

Three capabilities, presented in recommended build order:

| # | Capability | Effort (rough) | New infrastructure |
|---|-----------|----------------|--------------------|
| A | Agent panels — N co-agents + one human, turn-taking | ~2–3 weeks | None |
| B | Multiple humans in one session | ~4–6 weeks | SFU (LiveKit recommended) |
| C | Agents join Zoom / Teams / Meet calls | POC days–weeks (bot service); native much longer | Meeting-bot service or per-platform SDKs |

---

## A. Agent panels — multiple parallel co-agents alongside one human

**Goal:** several instances of the same or different co-agents in one live session, everyone taking turns, the human always able to take the floor.

### Why this is closer than it looks

- **Provider sessions are inherently 1:1** (one input stream, one voice out) — so a panel is simply **N provider sessions running concurrently in one browser**. Nothing about the drivers changes.
- **The browser already owns the audio plane.** `RealtimePcmPlayback` instances mix trivially through WebAudio, and the per-client audio meters (`GetAudioActivity`) give us per-agent orbs/avatars and "who is speaking" for free.
- **The pairing junction already models plurality.** `MJ: AI Agent Paired Agents` supports multiple targets per co-agent with `Sequence`; panel composition is a natural extension of the same metadata. Panel *policy* fits in the agent-type `TypeConfiguration` / `DefaultConfiguration` machinery shipped this branch.
- **Per-agent voice differentiation already exists** via the per-pairing/config voice settings, so panelists sound distinct.

### How agents "hear" each other

**Speaker-labeled transcript relay as context notes — not audio cross-feed.**

Each agent's final transcript turns are relayed to every *other* agent via `SendContextNote` with a speaker prefix (`[panel] Maya said: …`). Cross-feeding audio would:
- pollute every session's VAD (each agent would "barge in" on the others constantly),
- double-to-triple audio token cost,
- and add echo/feedback risk.

Text relay is cheap, deterministic, and rides a channel every driver already implements (with documented per-driver emulations).

### The one new component: `FloorManager`

A pure-TS turn arbiter in the same testable, framework-free style as `RealtimeDisclosureModel`:

- **States:** floor free / held-by-human / held-by-agent(X) / requested-by [queue].
- **Human priority:** human speech (we already have local VAD via `RealtimeAudioMeter`) always takes the floor; agents are barged-in via each driver's existing `CancelActiveResponse`.
- **Agent turns:** an agent without the floor never gets its generation trigger sent — the per-driver send queues we already maintain are the natural enforcement point. Granting the floor = sending a `RequestSpokenUpdate`-style trigger with the panel context.
- **Policies (configurable per panel):** round-robin, moderator-agent (one agent decides who speaks next — itself just a tool call), or speak-when-addressed (name/mention detection in the human's transcript).

### UX sketch

The overlay's hero grows from one orb to a row of orbs/avatars; the floor-holder's orb is live (audio-reactive), others idle. The thread already supports real speaker names. Channel surfaces (whiteboard) are shared — channel tools route to whichever agent holds the floor (or a designated "scribe").

### Cost note

N provider sessions = N × audio/session cost, plus each agent re-reads the panel transcript as context. Linear, predictable, and panel sessions would typically be short.

---

## B. Multiple humans in one session

**Goal:** two or more people connected to the *same* `AIAgentSession`, hearing each other and the agent(s).

### The blocker is the media plane

A provider session accepts one audio input stream. Two browsers can't hear each other *through* it, and mixing both mics into one stream destroys diarization and barge-in semantics. Building our own mixing/jitter/echo/NAT stack is months of specialist work — don't.

### Recommendation: SFU as an optional transport plugin (LiveKit)

- **LiveKit** (Apache-2.0, self-hostable, cloud option) is the obvious candidate: mature WebRTC SFU, and its agents framework already ships **OpenAI Realtime and Gemini Live adapters** — validation that the "AI participant in a room" pattern works against the same provider APIs we drive.
- **Mapping:** one `AIAgentSession` ⇄ one room. Humans join via browser WebRTC. Each co-agent joins as a **bot participant** whose audio I/O bridges server-side to its provider session.
- **This *is* the deferred "unified transport" work.** The co-agents guide already flags that server-bridged `IRealtimeSession.SendInput`/`OnOutput` have no client media pipe — the SFU becomes that pipe instead of bespoke websockets. One infrastructure decision closes two open items.
- **Plugin discipline:** ship it as a ClassFactory-resolved transport driver like everything else in the realtime stack — deployments without LiveKit configured keep today's client-direct topology untouched.

### Metadata changes (small migration)

- `AIAgentSessionParticipant` — SessionID, UserID, Role (`Host` / `Participant` / `Guest`), JoinedAt / LeftAt.
- Transcript turns stamped with the speaking participant (the thread UI already renders real user names; review gets true multi-party playback nearly free).
- Permissions: session owner invites; external guests compose with the existing **magic-link** scenario machinery (restricted role + entity permissions, runtime-provisioned users).

### What stays the same

Session lifecycle/janitor, channel persistence (`AIAgentSessionChannel`), artifacts, narration, observability — all already keyed by `AIAgentSessionID` and indifferent to how many humans are attached.

---

## C. Bridging into Zoom / Teams / Slack / Google Meet

**Goal:** an MJ realtime agent joins someone else's meeting as a participant.

### Route 1 — Meeting-bot API (fastest; recommended for the POC)

Services like **Recall.ai** expose one API that joins Zoom/Meet/Teams as a visible bot participant and streams audio both ways with **speaker diarization**. On our side: a `MeetingBridge` host service — the server-bridged `RealtimeSessionRunner` finally gets its media pipe, pointed at the bot stream instead of a browser. Diarized speaker labels slot directly into the transcript relay (and the panel-style context notes from A).

- **Pros:** days-to-weeks to a working POC; one integration covers three platforms; no per-platform app review.
- **Cons:** commercial dependency, per-minute pricing, bot visibly joins the call (which is also a compliance feature).

### Route 2 — Platform-native SDKs (only at scale / for compliance)

| Platform | Path | Friction |
|---|---|---|
| Zoom | Linux Meeting Bot SDK | App marketplace review; bot infra is ours to host |
| Teams | Azure Communication Services calling bots / Graph | Best-documented native path; Azure tenancy + Graph permissions |
| Google Meet | Meet Media API | Still allowlist / early-access |
| Slack | — | **No public huddle media API. Exclude for voice;** Slack should be a *text* surface via the existing channel/notification stack |

Each is its own multi-week integration plus hosting. Worth it only when a platform dominates a customer base or a bot-service dependency is unacceptable.

### Route 3 — SIP interop (piggybacks on B)

LiveKit's SIP participant can dial into **Zoom CRC** (paid add-on), **Teams** via certified SBC, and **Meet** SIP interop. Works today, but with "conference-room system" UX and per-org telephony config. A reasonable bonus once B exists; not the primary plan.

---

## Sequencing & rationale

1. **A — Agent panels.** No infrastructure, pure client + metadata, highly demo-able, and it forces the `FloorManager` + speaker-labeled relay abstractions that B and C both reuse.
2. **B — LiveKit transport plugin.** One infra decision unlocks multi-human *and* the unified server media transport the guide already defers.
3. **C — Meeting bridge.** Start with a bot-service POC on the server-bridged runner; revisit native SDKs per-platform as demand warrants. SIP comes almost free after B.

Cross-cutting from day one: participant identity on every transcript turn, floor/turn events in session observability, and panel/participant config expressed through the existing `TypeConfiguration` ← pairing ← runtime-override resolution chain (never hardcoded).
