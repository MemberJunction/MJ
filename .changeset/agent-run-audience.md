---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/core-actions": patch
"@memberjunction/integration-test-suite": patch
---

Agent runs bounded by an audience (A6, run level). `ExecuteAgentParams.Audience` (`{ Mode: 'Caller' | 'Intersection', UserIDs }`) names everyone besides the caller who will see a run's output — a shared conversation's other participants — and the run then shows only what the caller **and** every reader may see. It is server-only: a typed field, never read from `data`, so no GraphQL, MCP or A2A client can set it.

- **Validation and hydration.** `BaseAgent` validates the audience and loads each reader from the server's `UserCache` right after the permission check, refreshing the cache once for an unknown ID. A malformed audience, or an ID no user has, fails the run before any prompt, as a refused permission does. An `'Intersection'` whose only reader is the caller behaves exactly as `'Caller'`. Sub-agents and realtime delegation targets inherit the audience and hydrate it again. `ResolveAudienceUsers` is the override point. Adds a dependency on `@memberjunction/generic-database-provider` (for `UserCache`).
- **Pre-execution RAG** runs the scope-permission gate for every reader (the reader as `User`, the caller as `ContextUser`); a refused reader skips the scope and writes a `Forbidden` search-log row naming them. Both `Search` and `streamSearch` carry `SearchParams.Audience`.
- **Notes and examples**: under an audience only shared ones (`UserID` empty) are injected, via a new `SharedOnly` option on `AgentContextInjector` that filters `UserID == null` explicitly on the cache and semantic paths (an undefined `userId` does not mean "shared only" to `AIEngine`'s base filter).
- **Skipped or refused**: agent data-source preloading and the previous turn's tool-result carry-forward are skipped; task graphs are withheld (a copy of the cached prompt params) and a model-written graph is refused; session-driven (realtime / voice / bridge) runs are refused.
- **Actions**: `RunActionParams.Audience` is set per dispatch (never on the shared `Context`). `ActionEngineServer.RunAction` refuses, with result code `AUDIENCE_UNSUPPORTED` and without running the action or writing an execution log row, every action whose class does not declare `BaseAction.SupportsAudience` (new, default `false`) and every runtime-defined or deferred action, and normalizes the audience for an action it lets through. `BaseAgent` locks a refused action out for the run. The Search and Scoped Search actions declare support: they pass the audience to the search, Scoped Search runs the per-reader scope gate, and both withhold `SourceCounts`. New in `@memberjunction/actions-base`: `ActionRunAudience`, `ActionAudienceReaders`, `ActionAudienceAddsReader`, `AUDIENCE_UNSUPPORTED_RESULT_CODE`, and `ActionResult.ResultCode` (the raw result code, set whether or not it matches a metadata result code).

Deferred and documented (TSDoc, `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md`): per-reader scope expansion queries (`ScopeDimensionResolver` binds one `UserID`); `Union`, anchor and narrowing modes (use `PrimaryScope*` / `SecondaryScopes`); a resumed run (`MJAIAgentRequestEntityServer.resumeAgent`) runs as the responder with no audience, because persisting the audience needs a column — an open design point shared with bound action parameters; conversation history and artifacts remain the host's to choose. Agents whose work needs actions other than the two search actions are refused those actions in shared rooms, by design.

Tests: unit suites for each package, and a new deterministic integration bundle `agent-run-audience` (IT110, AU1–AU6). No migration.
