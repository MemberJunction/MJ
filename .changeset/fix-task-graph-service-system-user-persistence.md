---
"@memberjunction/task-graph": patch
---

Use `UserCache.GetSystemUser()` for internal `TaskGraphService` persistence writes (`MJ: Task Types`, `MJ: Tasks`, `MJ: Task Dependencies`) so non-Owner `UI` users can submit and retry durable task graphs — including on fresh databases where `'AI Workflow'` does not yet exist — while keeping all caller authorization (`resolveAgents`, `resolveActions`, `resolvePrompts`, `FindCrossUserAssignments`) and row attribution (`submittedByUserID`, `Human` step `UserID`, `SecurityEnvelope`) strictly bound to `context.ContextUser`.
