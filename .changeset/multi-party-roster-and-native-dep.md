---
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-bridge-livekit": patch
---

Multi-agent rooms: an agent is recorded as an agent, and the native room client can actually be installed

Both found by running a real two-agent LiveKit room rather than by reading the code.

**No participant row in a multi-agent room was ever flagged as an agent.** `upsertParticipants`
recomputed `IsAgent` as "is this MY bot", discarding the driver's answer, on the reasoning that
diarization could OR-reduce across the room because "each agent's OWN bridge marks itself". That
premise is false: a roster comes from `room.remoteParticipants`, and a participant is never in its
own remote list, so a bridge's own bot never appears in its own roster. Measured on a live
two-agent room: **zero** rows had `IsAgent` set, so per-turn diarization could not tell an agent
from a human anywhere in a panel. The engine now trusts the driver's `IsAgent`, which already means
"is this identity an agent" — the local bot or any bot by identity convention. That is also the
question a consumer actually asks: whether a speaker is an agent is a property of the identity, not
of which bridge happened to observe it.

**`@memberjunction/ai-bridge-livekit` could not load the native room client it documents.** It
imports `@memberjunction/ai-bridge-livekit-native` dynamically but never declared it, so under
pnpm's strict isolation the import resolves from the provider's own location and fails there — no
host can satisfy the error message the provider itself prints, because installing the package
alongside the *host* does not put it where the *provider* looks. Declared as an optional dependency.
