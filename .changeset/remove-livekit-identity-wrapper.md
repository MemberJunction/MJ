---
"@memberjunction/ai-bridge-livekit": patch
---

`@memberjunction/ai-bridge-livekit` no longer exports its own `IsAgentParticipantIdentity`, added earlier in this release: use the one in `@memberjunction/ai`, which the bridge calls. Nothing behaves differently.
