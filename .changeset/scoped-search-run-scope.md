---
"@memberjunction/actions-base": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

The Scoped Search action takes its tenant from the agent run, not from the model (A12.14).

**Behaviour change.** Inside an agent run, the run's scope is authoritative for Scoped Search. A `PrimaryScopeRecordID` the run does not carry (a different tenant, or any tenant when the run has none) is refused with `INVALID_PARAM` and a `Forbidden` search-log row; with no `PrimaryScopeRecordID` the action searches the run's tenant. `SecondaryScopes` may restate a dimension the run sets only with an equal value; a dimension the run does not set is still added. The host sets the run's scope (`ExecuteAgentParams.PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes`), never the model. The resolved tenant goes into both the permission decision and the search, so omitting it no longer drops tenant-scoped deny rows from the decision. A single agent run can no longer search several tenants by passing different values; run one run per tenant. Direct action calls outside an agent run are unaffected.

**Malformed `SecondaryScopes` now refuses.** Input that is not valid JSON, is not an object, or holds a value other than a string, number, boolean or string array is refused with `INVALID_PARAM`, inside and outside a run. Before, it was logged and dropped, so the search ran without those dimensions. An object value is now accepted as well as a JSON string.

- **`@memberjunction/actions-base`**: new `RunActionParams.RunScope` (`ActionRunScope`, `ActionRunScopeValue`). It is the run's tenant and secondary dimensions, set per dispatch beside `Audience`, never on the shared `Context`. Fields are `null` when the run is unscoped; the field is absent outside an agent run.
- **`@memberjunction/ai-agents`**: `ExecuteSingleAction` always stamps `RunScope`. Inside `Execute` it uses the scope `initializeAgentRun` validated and wrote to the run row, with the agent's `ScopeConfig` defaults applied; called directly, it resolves the scope from its params the same way. `ExecuteSubAgent` strips the reserved run-data keys from the model-authored `templateParameters` before merging them into the child's `data`, and logs the key names once. The reserved keys are the scope family and `__agentTypePromptParams`. Without this a model could set a sub-agent's tenant whenever the parent's scope arrived through `data`. The parent's own `data` is passed on unchanged.
- **`@memberjunction/ai-core-plus`**: new `RESERVED_AGENT_RUN_DATA_KEYS` and `WithoutReservedAgentRunDataKeys`. `@memberjunction/server`'s agent-run `data` guard now uses this shared list instead of its own copy.
- **`@memberjunction/core-actions`**: Scoped Search resolves the tenant (`resolveTenant`). Forbidden rows now record the tenant they were judged under. TSDoc and `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` updated.

Tests: unit tests in each package, and a new check in the deterministic `agent-run-audience` bundle (IT110, AU7). No migration.
