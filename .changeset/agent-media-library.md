---
"@memberjunction/ai-agents": minor
---

Agent media library: a realtime agent can now draw on a curated, governed **media kit** during a conversation — a `MJ: Collections` of `MJ: Artifacts` bound to the agent via the new `AIAgent.DefaultMediaCollectionID`, with per-membership `ContextDescription` ("when to show it") and `Preload` on `MJ: Collection Artifacts`. The `MediaChannelServer` resolves the kit at session start and feeds the model a manifest so it can surface items via the existing `Media_ShowMedia` tool. Additive only; reuses Files/streaming/viewers/versioning/permissions (no new top-level entity). Requires the companion migration + CodeGen.
