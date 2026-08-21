---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-bridge-server": minor
"@memberjunction/livekit-room-server": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
---

Multi-agent rooms: gating that actually holds, and seats that can be quiet, silenced, human-held, and in character

The room layer already put N agents in one LiveKit room and arbitrated a floor between them. Five
gaps kept that from being usable by a consumer whose agents are configured characters rather than
one generic assistant. All five were found building a panel interview on it.

**A room whose FIRST agent cannot reconfigure a live socket is now re-gated by reconnecting it.**
`ReconfigureSessionToMeeting` previously logged and gave up when the provider fixed its turn config
at connect (Gemini), leaving that agent auto-responding to all room audio, bypassing the moderator
and talking over the cast — the code's own comment named the fix. `EnsureSessionMeetingGated` now
mints a replacement session in meeting mode, swaps it onto the same `AIAgentSessionBridge` row and
`AIAgentSession`, re-wires the transport and turn seams, and closes the old socket in a `finally`.
Room membership, scribe election and attribution survive; the reopened leg starts a fresh co-agent
run under the same agent session. Outbound frames are dropped while a reopen is in flight (an
un-gated agent must not keep talking through its own reconnect), concurrent callers share one
promise, and attempts are capped — at the limit the agent keeps its original socket, because a
degraded seat beats a dead one.

**The effective turn state is now readable.** `GetEffectiveTurnState`, plus `MeetingGated` /
`CanReconfigureTurnMode` on the room-start result. Whether a room is properly gated was previously
observable only by listening to it.

**`ParticipationMode` is per-agent.** It was hard-coded `'proactive'` for every agent, with a
comment acknowledging per-agent resolution as a follow-up, so a room could not have a deliberately
quiet seat — an observer, or a specialist who answers only when called on. An explicitly
`addressed-only` agent is now gated even when it is alone in the room, rather than auto-responding
until a second agent happens to arrive.

**An agent can be silenced without being killed.** `SuspendBridgeAgent` / `ResumeBridgeAgent` stop
an agent responding and publishing while keeping its socket, session, transcript persistence and
observability run — the previous only option was `StopBridgeSession`, which tears all of that down.
Suspension holds at three points because the moderator drain bypasses the turn policy: the outbound
seam, the speak trigger, and the room roster. Prior state is captured and restored verbatim rather
than guessed.

**A human can hold the floor.** `MultiAgentRoomCoordinator` keyed membership on `AgentSessionID`
only, so a human participant could never be granted the floor and agents had no structural reason
to yield. Floor membership is now a participant reference — agent session or user — with every
existing string caller still compiling and behaving identically. A human's claim always wins
(`HumanOverride`: the coordinator cannot mute a person) and agents yield to `HeldByHuman`,
facilitator included. `IsMultiAgentRoom` still counts agents only, so one agent plus one human stays
a 1:1 call rather than being re-gated into a meeting.

**A bridged seat can be given per-session instructions.** Neither `BridgeRealtimeSessionContext` nor
`RealtimeSessionStartContext` could carry them, so a bridged agent's prompt came from its agent
record alone: two agents in a room could be given distinct *voices* but not distinct *characters*.
`Instructions` now threads from `StartLiveKitAgentRoomSessionInput` through to
`buildCompanionSystemPrompt`, **appended** to the companion prompt exactly as the client-direct
subclass seam composes it, so framework framing and safety text survive. It rides the reopen closure
above, so a re-gated seat comes back as the same character instead of silently becoming someone
else mid-meeting. Gated behind `Realtime: Advanced Session Controls` — caller-supplied text appended
to a system prompt is strictly more prompt influence than the `configOverridesJson` that gate
already protects — and the check is extracted rather than copied, because two copies of a
fail-closed gate must agree on which direction they fail in.

All additive: every omitted field behaves exactly as before.
