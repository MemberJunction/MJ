---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/actions-base": patch
"@memberjunction/core-actions": patch
"@memberjunction/integration-test-suite": patch
---

An agent run can fix some of an action's input parameters so the model can neither see nor change them (`ExecuteAgentParams.boundActionParams`, A16 of #4789).

- **`boundActionParams`** is `Record<actionID, Record<parameterName, value>>`. A bound parameter is left out of the action's description in the prompt catalog (including a narrowed catalog), out of its native tool schema, out of the result echoed to the model, out of the model-facing invocation record, and out of what Find Candidate Actions / Find Best Action report (they read the bindings from the action `Context` as `BoundActionParams`). At dispatch the bound value replaces whatever the model (or a Flow step's input mapping) sent under that name; the override is logged with the run and step IDs, and the model's value is never passed on. Bindings reach every sub-agent run and the realtime delegation target, as `actionChanges` do.
- **Refusals.** A required parameter bound to `null`/`undefined`, or a binding that names no input parameter of the action, refuses the call before it reaches the engine: the reason is logged for the operator, the model is told only that the action is unavailable, and the action is locked out for the rest of the run like a fatal configuration failure (the circuit breaker short-circuits later calls). A binding keyed by anything other than a known Action ID fails the run at its start. An optional parameter bound to nothing is hidden and the action receives no value for it.
- **Fail closed.** A run with bindings has task graphs withheld (`enableTaskGraphs` is ignored and a graph the model emits anyway fails the step), because a graph's action nodes are dispatched outside the agent's binding gate.
- **Audit.** `ActionParam` gains an optional `Bound` marker that the action execution log's `Params` keeps (through redaction too), and the agent run step's `InputData` lists the bound names.
- **Nothing changes without bindings:** the catalog, the tool schema, the dispatched parameters and the action context are byte-for-byte what they were. `ExecuteSingleActionOptions.StepID` is new and optional.
- **Limits, documented on the field:** bindings are not persisted, so a run resumed from a stored request starts without them (as it does without `actionChanges`); the realtime client-direct action path and the workflow meta-actions (Loop, Conditional, Retry, Parallel Execute, Execute Agent) dispatch actions themselves and do not apply bindings; an action's own message text may mention a bound value.
- Two deterministic integration checks (`agent-loop-standin` ALS12, ALS13) cover the dispatched bound value with its `Bound` log marker and the refusal lockout.

New exports from `@memberjunction/ai-agents`: `BindingsForAction`, `UnboundParams`, `IsBoundParamName`, `ApplyBoundActionParams`, `BoundParamsApplication`, `ActionBindings`. New type in `@memberjunction/ai-core-plus`: `BoundActionParams`.
