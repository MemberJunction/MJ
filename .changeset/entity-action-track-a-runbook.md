---
"@memberjunction/actions-base": minor
"@memberjunction/actions": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/task-graph": minor
"@memberjunction/server": minor
---

The entity-action substrate finishes what its schema has been promising. Seven pieces, all of which
share a failure shape: a column, a flag or a field that read as configured and did nothing.

**Transition filters.** An entity action could see a record's current state and nothing else, so
"when Status *becomes* Approved" was indistinguishable from "when Status *is* Approved" — which is
true on every subsequent save too. `EntityChangeContext` now carries both sides of the save to where
filters run, built from `EntityField.OldValue`, which `BaseEntity` has tracked all along and simply
never carried anywhere. Filter code gets `DidFieldChange`, `DidFieldChangeToValue`, `OldValues` and
`NewValues` on `ActionFilterContext`. A create reports no changes, because a record whose Status
started at Approved did not *become* anything. Comparison is loose across the string boundary
metadata forces, so a configured `'1'` matches a numeric `1` rather than silently never matching.

The capture happens as the first statement of `HandleEntityActions`, deliberately before its first
`await`: After-hooks are fire-and-forget, and the moment that method yields, the save completes and
reloads the entity, resetting every `OldValue`. Reading `IsCreate` from that same synchronous
snapshot also closes a latent bug — `entity.IsSaved` was previously read *after* an await, so a
create whose save finalized in that window dispatched as `AfterUpdate`.

**Two filter-substrate fixes fall out of using it for real.** `EntityActionFilter.Status` was never
consulted, so a `Disabled` binding still gated — and filters fail closed, so that was not an inert
row but a permanent block whose only symptom is a trigger that quietly stopped firing. And a binding
pointing at an unresolvable filter used to reach the evaluator as `undefined` and throw there:
fail-closed by accident, with no usable reason logged. It now returns a failed result naming the
filter.

**Workflow triggers accept a filter.** `ValidateWorkflowSpec` refused `WorkflowEntityEventTrigger.filter`
outright because the contract to honor it did not exist. It now reconciles onto an owned
`ActionFilter` bound through `EntityActionFilter` — the additive path — and validates that the
expression parses, because filters fail closed and a syntax error is not a loud failure, it is a
trigger that silently never fires.

**Record Process on-change triggers.** `OnChangeEnabled` has described itself as running "per-record
on save via an owned Entity Action" since the column shipped, and `OnChangeFilter` promised to
"compile into the owned Entity Action Filter". Neither owned anything. Saving a Record Process now
reconciles that binding, matching ownership on the `RecordProcessID` param — `Run Record Process` is
one shared action, so matching on entity + action alone would let a second process silently repoint
the first one's trigger. `OnChangeFilter` compiles through the same builder workflow triggers use, so
one expression vocabulary covers both surfaces.

**Durable `After*` dispatch (D14).** After-hooks are fire-and-forget, so a process dying mid-flight
loses the action with nothing to retry it. `EntityAction.RunMode = 'Durable'` routes the dispatch to
the task-graph substrate as a single-node durable graph — the claim protocol, restart recovery and
orphan reclaim that already exist there — rather than adding a third async substrate. Opt-in per
binding, because it costs a Task row, a dispatcher hop, and params persisted at rest. When no
submitter is registered or submission fails, the work runs **inline**: `Durable` asks for the work to
be harder to lose, so dropping it would make opting in less reliable than leaving it off. New
`Task.ActionID` widens the assignment exclusivity to three ways, and `TaskGraphSpecNode.actionName`
joins `agentName`/`assignToUser`.

**Execution-log retention.** `Action.RetentionPeriod` and `ActionExecutionLog.RetentionPeriod` shipped
with descriptions and no reader anywhere in the codebase; the log grew forever while the schema
claimed otherwise. Retention is now stamped onto each row when the run starts — decided at write
time, so editing an action's retention is a going-forward change rather than a retroactive deletion —
and a new opt-in `Action Log Retention` scheduled job purges expired rows oldest-first, bounded per
run, reporting when it stopped at its ceiling rather than because it was finished.

**The `Validate` invocation hole.** `EntityActionInvocationValidate` overrode single-record invocation
with a near-copy that had drifted into a strict subset: no scope resolution (so a binding narrowed to
one record ran `Validate` against every record of the entity) and no provenance (so a whole-record
parameter was logged raw, ignoring the binding's `LogValue` rows). The override is deleted; the class
inherits, which is what keeps both facts true for `Validate` permanently rather than until the copies
drift again.

**The `RunEntityAction` null contract.** `null` means the action did not run — the binding is scoped
and this record falls outside it. `HandleEntityActions` guarded for it; the GraphQL resolver did not,
so an out-of-scope binding surfaced to clients as a server error. The signature now says so and the
resolver reports it as the ordinary outcome it is.
