---
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-livekit": patch
---

Multi-agent rooms: every other agent in the room was recorded as a human

Found by running a real two-agent LiveKit room rather than by reading the code, and confirmed
against the persisted rows.

**The shared false premise.** `IsLocal` identifies only a bridge's OWN bot, and an SFU never lists
a participant in its own remote roster — so in a multi-agent room `IsLocal` is false for every agent
a bridge can actually *see*. Measured: bridge `53C6…` owns agent session `779F…`, and its one roster
row is `agent-03E2…` — the OTHER bridge's bot. A bridge's own bot never appears in its own roster,
so anything deriving agent-ness from `IsLocal` answers "human" for the entire rest of the panel.

Three places had derived it that way:

- `upsertParticipants` recomputed `IsAgent` as "is this MY bot", discarding the driver's answer, on
  the reasoning that diarization could OR-reduce across the room because "each agent's OWN bridge
  marks itself". Measured on a live two-agent room: **zero** rows had `IsAgent` set, so per-turn
  diarization could not tell an agent from a human anywhere in a panel. The engine now trusts the
  driver's `IsAgent`, which already means "is this identity an agent".
- `mapParticipantRole` returned `'Agent'` only for `IsLocal`, so remote agents persisted as
  `Role = 'Participant'` — a row asserting `IsAgent = true` and `Role = 'Participant'` about the same
  participant, leaving consumers to pick a half to believe. This sat one line above the identity
  convention that already existed to fix exactly this, and whose own doc comment describes the bug.
- The Meeting Controls roster (`toMeetingParticipant`) applied no identity check at all, so the Meet
  UI's participant list showed every other agent in the room as a person.

Agent-ness is a property of the IDENTITY, not of which bridge observed it. It is now decided once,
in `IsAgentParticipant`, and both roster mappers derive `IsAgent` **and** `Role` from that single
answer — so the two fields on a row can no longer disagree.

**Loading the native room client is now explained where it fails.** `@memberjunction/ai-bridge-livekit`
imports `@memberjunction/ai-bridge-livekit-native` dynamically and cannot declare it:
the native package depends on this one, so declaring it back is a dependency cycle (turbo rejects the
graph outright). The load therefore resolves from the *provider's* location, and installing the
wrapper alongside the **host** does not put it where the provider looks — which is what the previous
error message told operators to do. The existing `LIVEKIT_NATIVE_MODULE` env override is the
supported lever; the error now names it, says an absolute path is required under a strict-isolation
installer such as pnpm, and states why the dependency is deliberately undeclared.
