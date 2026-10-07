---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/core-actions": patch
"@memberjunction/integration-test-suite": patch
---

Review fixes for agent run audiences and run scope. No migration, no metadata change.

- **Audience validation.** A `Mode` naming something `Object.prototype` carries (`'toString'`, `'constructor'`, `'__proto__'`...) passed validation and added no reader, so every gate was skipped. It now fails the run like any unknown mode.
- **Task graphs in a tenant-scoped run.** A graph's action and agent nodes run with no `RunScope` and no run context, so a Scoped Search node searched outside the run's tenant. Graphs are now withheld, and a model-written graph refused, when the audience adds a reader or the run's validated scope carries a tenant or a secondary dimension. The predicate is `ActionRunScopeIsBounded`, new in actions-base.
- **The Search action in a tenant-scoped run** is refused (`RUN_SCOPE_UNSUPPORTED`) and the model is pointed at Scoped Search. Search takes no tenant, so it would search across tenants.
- **One scope for the whole run.** Notes and examples, pre-execution RAG, scoped prompt parts and scoped prompt configs read the scope `initializeAgentRun` validated. That is the scope on the run row and on every action dispatch: trimmed, with `ScopeConfig` defaults applied. A `SecondaryScopes` value that is not a plain object is logged and ignored, not cast.
- **More paths under an audience.** Client tools are not offered and a client-tools step is refused. The caller's app context is not injected. Memory writes are not saved. Scoped Search's streamed `ProgressEvents`, and the RAG streaming trace, carry no provider counts. No `MJ: AI Agent Requests` row is raised for a Chat or Plan step: answered on the dashboard or the API, it would resume the run without the audience, and no existing field can carry the audience without misusing one the UI shows. The room still answers in the conversation.
- **Lockout wording.** An action refused for the audience (`AUDIENCE_UNSUPPORTED`) is locked out under a new `'audience'` circuit-breaker reason. The model is told it is unavailable in a shared conversation, not that it hit a configuration or credential error.
- **Malformed audiences on actions.** `ActionEngine.CheckAudience` refuses every action under a malformed audience. Search and Scoped Search test `!== undefined`, so a `null` audience no longer runs an unbounded search or returns `SourceCounts`.
- **Execute Agent** passes the calling run's `RunScope` and audience to the nested run as first-class fields. It still does not declare `SupportsAudience`, so it is refused under an audience.
- **Sub-agent template parameters** also lose the host-only browser, conversation and realtime keys (`HOST_ONLY_AGENT_RUN_DATA_KEYS`, `WithoutHostOnlyAgentRunDataKeys` in ai-core-plus): `clientTools`, `sessionID`, `appContext`, `applicationId`, `conversationId`, `targetAgentID`, `agentSessionId`, `recording` and `realtime*`.
- **Smaller fixes.**
  - Hydrated readers are cleared when the run ends.
  - Dispatch readers exclude the user the action actually runs as.
  - Inactive users are documented as accepted readers.
  - `Forbidden` rows for a refused reader name the reader's ID and the verdict `Source` only.
  - The `ActionRunScopeValue` drift-guard TSDoc is corrected.
  - Scoped Search's `INVALID_PARAM` messages say exactly what to pass.
- **Tests.** Unit tests in each package, and `agent-run-audience` (IT110) gains AU8 (prototype-name mode) and AU9 (Search refused in a tenant-scoped run).

Follow-up: the Scoped Search parameter descriptions in `metadata/actions/.scoped-search.json` are stale. They describe the tenant as supplied per call and say malformed `SecondaryScopes` are skipped. Update them in a metadata PR (a `minor` changeset).
