---
"@memberjunction/ai": patch
"@memberjunction/livekit-room-core": patch
---

The participant attributes that say who an agent may see in a meeting now live in `@memberjunction/ai`, so the browser's room, the server that records a person's choice, and an agent's bot share one definition: `REALTIME_AGENT_CAN_SEE_ATTRIBUTE` (`mj.agentCanSee`), `REALTIME_AGENT_WATCHES_ATTRIBUTE` (`mj.agentWatches`), and the readers `AllowsAgentVision` and `IsAgentWatching` (only the value `'true'` counts). `@memberjunction/livekit-room-core` reads them through these and no longer exports its own `LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE` / `LIVEKIT_AGENT_WATCHES_ATTRIBUTE`, added earlier in this release.
