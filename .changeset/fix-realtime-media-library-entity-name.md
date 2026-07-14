---
"@memberjunction/ai-agents": patch
---

Fix realtime agent media library failing with "Entity AI Agents not found in metadata" — the agent lookup in `resolveAgentMediaCollectionID` used the pre-v5 unprefixed entity name `'AI Agents'` instead of the canonical `'MJ: AI Agents'`, so an agent's media kit (`DefaultMediaCollectionID` collection) silently never loaded at realtime session start. Adds a regression test pinning the canonical entity name.
