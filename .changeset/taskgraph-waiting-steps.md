---
"@memberjunction/ai-core-plus": minor
"@memberjunction/task-graph": minor
"@memberjunction/ai-agents": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-flow-editor": minor
"@memberjunction/ng-task-graph-editor": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/graphql-dataprovider": minor
---

Workflows gain waiting steps, a pluggable Human-step provider, durable retries, and lose the 50-step cap (minor: migrations `V202611181900__v6.3.x__TaskGraph_Waiting_Steps` and `V202611182100__v6.3.x__TaskGraph_Durable_Retry`).

- **External steps run.** A step reached by the dispatcher waits until something completes it through the new `TaskGraph.CompleteWaitingStep` operation (or `TaskGraphWaitingSteps.CompleteWaitingStep` in-process), by task ID or by `correlationKey`. The signal's payload is merged into the workflow payload; a signal that arrives early is held and applied when the step is reached; `expiresInHours` fails the step when nothing arrives. New column `Task.CorrelationKey`.
- **Wait steps.** `{ until }` (timestamp or `payload.<path>`) or `{ durationSeconds }`, durable on `Task.DueAt` and judged on the database clock.
- **Human-step providers.** A Human step may name `provider`; any package can register `@RegisterClass(BaseHumanTaskProvider, '<key>')`, raise the ask in its own system, and complete the step through the same completion path. Omitted or `AgentRequest` keeps the built-in inbox. Unregistered providers are refused at submit.
- Drawn workflows (`AIAgentStep`) accept `External` and `Wait` steps, and Save-as-Workflow now keeps Human, External and Wait steps instead of dropping them. The flow editor's palette offers Person, External Signal and Wait steps with fields for their settings, and the task-graph canvas renders Wait steps.
- A waiting step records its output taint like any runner: a Wait passes on its input taint, a signal that carries a payload taints what follows (it is outside content), and a provider's completion never clears taint.
- The 50-node cap now applies only to model-authored graphs (`MAX_TASKS_PER_AGENT_GRAPH`); code-built and drawn graphs are bounded by a 10,000-node blast-radius ceiling.
- Record-change triggers follow the workflow's status: bindings are `Active` only while the workflow is, and a removed trigger's binding is disabled. Two triggers on one entity and scope with different filters are reported instead of one silently overwriting the other.
- **Retries are durable.** A step with `policy.retryCount` that fails goes back to `Pending` with `Task.AttemptCount` and `Task.NextAttemptAt` (database clock) instead of being retried by sleeping inside the claim, so a retry survives a restart and runs on any instance. Action steps retry only when their action is idempotent (unchanged), Prompt and Decision steps now retry, Agent steps never do. Viewers receive a `ClaimChanged` frame with `ClaimEvent: 'retry-scheduled'`. `TaskGraph.RetryTask` resets the count.
