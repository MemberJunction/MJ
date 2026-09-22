---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-openai": patch
---

fix(realtime): a spoken update no longer wipes the session identity it speaks under

`RequestSpokenUpdate` sent the caller's direction as `response.create`'s per-response
`instructions`. On the OpenAI Realtime protocol that field is a **full override of the session
system prompt for that response**, not an addition to it — so the one turn riding this method spoke
with no identity at all: no persona, no name, none of the standing directives the session was
minted with.

The server-side driver already knew the rule and guarded the BLANK case on it, in its own words:
forwarding `''` "would wipe the co-agent identity framing (incl. the `call invoke-target-agent,
don't do the work yourself` directive)". The non-blank case was never guarded, and it wipes exactly
the same framing — just less visibly, because only the requested turn loses it while every other
turn in the same session reads correctly.

Reported from a downstream hiring product (bizapps-caliber#397), where the failure was as visible as
it gets: the interviewer's opening turn — the first thing an external candidate hears — introduced
her as *"ChatGPT, your friendly voice companion"*, while turns 4, 7 and 12 of the same session all
correctly said *"I'm Sam Rivera, Support Team Lead."* The candidate asked about it unprompted and
the model conceded it had broken character.

Both twins now carry the session prompt ahead of the direction, so the direction stays last (the
most recent line is the one a model weights hardest) and no caller has to restate an identity the
session already holds:

- `@memberjunction/ai-realtime-client` — `OpenAIProtocolRealtimeClient.RequestSpokenUpdate` builds
  its frame through a new `buildSpokenUpdateEvent`, reading the pact through a
  `currentSessionInstructions()` seam that each transport answers with the config it actually
  applied (WebRTC from `sessionConfig`, websocket from `sessionObject`). A blank direction now
  sends a bare `response.create`, matching the server twin.
- `@memberjunction/ai-openai` — `OpenAIRealtimeSession` retains the prompt it last sent in
  `session.update` and carries it the same way.

This reaches every caller of the method, not only an opening turn: silence check-ins, progress
narration and delegation narration were all speaking without identity on that turn.

`OpenAILiveClient` is deliberately unchanged — it sends a bare `response.create` after
`session.commentary.append`, so the session prompt already governs there and it never had this
defect.
