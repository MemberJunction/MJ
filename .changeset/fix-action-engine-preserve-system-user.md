---
"@memberjunction/actions": patch
---

Preserve the server system user resolved by `BaseEngine.ResolveContextUser()` across subsequent `ActionEngineServer.Config(false, callerUser)` and `EntityActionEngineServer.Config(false, callerUser)` calls so non-Owner `UI` agent runs never downgrade `ActionEngineServer.ContextUser` and fail `MJ: Action Execution Logs` persistence.
