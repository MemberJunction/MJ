---
"@memberjunction/ai-core-plus": minor
"@memberjunction/server": minor
"@memberjunction/conversations-runtime": minor
"@memberjunction/ng-conversations": minor
---

Render agent final-response streaming in the conversation chat. Adds an optional `kind` discriminator to agent streaming chunks — `'final-response'` marks deltas of the user-facing reply — passed through the server's PubSub payload; the conversation client now routes those chunks, accumulates deltas service-side, renders the growing text in the message bubble, and reconciles with the saved final message on completion. Unmarked streams (e.g. Loop-agent JSON turn envelopes) keep today's behavior exactly (dropped), so agents that don't opt in are unaffected.
