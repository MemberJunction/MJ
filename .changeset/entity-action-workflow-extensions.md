---
"@memberjunction/core-entities": minor
"@memberjunction/actions": minor
"@memberjunction/actions-base": minor
---

Entity Action workflow extensions — turn `EntityAction` into the general workflow-hook substrate, and make its execution log safe and diagnosable.

`EntityAction` was already wired into the save path (`Validate` is a real blocking gate that fails the save) and `Execute Agent` already let any binding run a flow or loop agent. This adds what was missing to use it as the workflow layer across MJ and every OpenApp, rather than each app inventing its own.

**Schema (additive):**

- `EntityAction.ScopeEntityID` + `ScopeRecordID` — bind a workflow to one *configuration* record (a Deal Type, a Contract Type, a Pipeline, a Company) instead of every record of an entity. `NULL` keeps today's apply-to-all behaviour. This is what stops every app growing a column per type per event.
- `EntityAction.Sequence` — deterministic ordering when several bindings share an invocation type.
- `EntityAction.LoggingMode` — `All` / `FailuresOnly` / `None`, per binding.
- `EntityActionParam.ValueType` gains `'Entity Object Data'` — passes `entity.GetAll()` rather than the live `BaseEntity`. Required for anything that serializes the value, notably `Execute Agent`'s `Data` payload, where a `BaseEntity` yields `{}` because its fields are getters rather than enumerable own properties.
- `ActionParam.LogValue` and `EntityActionParam.LogValue` — control whether a parameter's value may be written to the execution log.
- `ActionExecutionLog.EntityActionID`, `EntityActionInvocationTypeID`, `TargetEntityID`, `TargetRecordID` — provenance, so a failed workflow can be traced to the binding, the record and the event that fired it.
- `ActionExecutionLog.ResultParams` — the final parameter set, so `Params` can stop being overwritten and keep the inputs *as the action was called*.

**Behaviour changes specified for the engine (not built in this change):** whole-record parameter value types are never written to the execution log; redaction is a shared helper applied by every persister rather than inline in the log methods; `ResultParams` is written on failure exactly as on success; `After*` invocations route through `QueueManager` so failures are durable.

**Metadata:** `Execute Agent`'s content-bearing parameters (`Data`, `ConversationMessages`, `Payload`, `AgentResult`) ship with `LogValue: false`. Its identifier parameters stay logged, so a run remains diagnosable and the content is one hop away in `MJ: AI Agent Runs`.

Existing behaviour is unchanged: every new column is nullable or defaulted to today's semantics. Requires `mj codegen` after the migration — see `plans/entity-action-workflow-extensions.md` §6 for the ordering, which matters.
