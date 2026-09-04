---
"@memberjunction/ng-conversations": patch
---

Realtime: the agent can speak FIRST

Every existing path into the live model's voice is reactive — the human spoke, or a channel
reported input. A host that needs the agent to open the conversation (an interviewer greeting a
candidate, a guide introducing a task) had nothing to call, so the session connected and both
sides waited for the other. The service already had the primitive; it was private and reachable
only from a channel.

`RealtimeSessionService.RequestSpokenOpening(instructions)` exposes it at the session level. The
instructions say what to open with, in the host's words; the model still speaks in its own voice
and persona.

It returns whether the request was DELIVERED, which is the one way it deliberately differs from
`SendContextNote` beside it: a dropped context note costs the model a little perception, while a
dropped opening line is a session that sits in silence. `false` means no session was live — a host
that asked before the connection reached a speaking state can retry, but only if it is told.
