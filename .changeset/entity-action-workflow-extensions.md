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

**Engine behaviour (built in this change):** whole-record parameter value types (`Entity Object` / `Entity Object Data`) are never written to the execution log — rule 1 of `RedactParams`, which no `LogValue` flag can re-enable; redaction runs through one shared helper applied by every persister rather than inline in the log methods, so no path can write a raw `ActionParam[]` to persistent storage; the input snapshot is taken at the top of `RunAction` so all four exit paths (validation failure, filter refusal, timeout/abort, normal completion) record the same as-called values; `ResultParams` is written on failure exactly as on success, so `NULL` means precisely "the run never finished"; scope resolution is fail-closed — a scoped binding that cannot be resolved declines to fire; and `LoggingMode` gates *logging only*, never execution.

**⚠️ Semantic change to an existing column — `ActionExecutionLog.Params`.** It previously held the final *merged* parameter set (inputs plus any outputs the action appended). It now holds the *as-called inputs*, and the merged set moves to the new `ResultParams` column. This is a repurposing, not merely an added column: any existing dashboard, report, query or downstream consumer reading `Params` to see an action's **outputs** will now silently get its **inputs** instead, and must be repointed at `ResultParams`. The column's extended-property description is updated to match. Nothing else about the row changes.

**Metadata:** `Execute Agent`'s content-bearing parameters (`Data`, `ConversationMessages`, `Payload`, `AgentResult`) ship with `LogValue: false`. Its identifier parameters stay logged, so a run remains diagnosable and the content is one hop away in `MJ: AI Agent Runs`.

Existing bindings and direct action invocations are unchanged: every new column is nullable or defaulted to today's semantics (`Sequence` DEFAULT 0, `LoggingMode` DEFAULT `'All'`, `LogValue` DEFAULT 1), and an unscoped binding short-circuits to "applies". The one exception to "purely additive" is the `Params` repurposing called out above. Requires `mj codegen` after the migration — see `plans/entity-action-workflow-extensions.md` §6 for the ordering, which matters.

**Known follow-ups (not blockers, tracked separately):** undeclared output params pushed via `addOutputParam` have no `ActionParam` row to opt out with, so they default to logged; shape recording emits top-level key names, which are schema for a record but content for a map keyed by IDs; and execution-log retention (§5.8 Scheduled Job) is documented but not yet enforced, so row count is unbounded.
