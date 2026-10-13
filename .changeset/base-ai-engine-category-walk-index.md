---
"@memberjunction/ai-engine-base": patch
---

`AIEngineBase.ResolveAgentStorageAccountID` walks up the agent category tree with an `IndexByUUID` lookup instead of an `AgentCategories.find(... UUIDsEqual ...)` scan on every step, and tracks visited categories in a `UUIDSet`, so cycle detection compares IDs the same case-insensitive way the lookup does. The result is unchanged.

This also restores the `UUIDCompliance` nested-scan baseline that #5585 tripped when it moved this walk out of `base-agent.ts`, which has been failing the Source guards check on `next` and on every PR since.
